import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'
import { join } from 'path'

function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return 'N/A'
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i]
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return ''
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
}

function downloadPlugin() {
    const isWin = process.platform === 'win32'
    const ytDlpBin = join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp')

    return {
        name: 'youtube-download',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                try {
                    const url = new URL(req.url, 'http://localhost')

                    if (url.pathname === '/api/download-info') {
                        const videoId = url.searchParams.get('v')
                        if (!videoId) {
                            res.writeHead(400, { 'Content-Type': 'application/json' })
                            res.end(JSON.stringify({ error: 'Missing video ID' }))
                            return
                        }

                        const youtubedl = (await import('youtube-dl-exec')).default
                        const info = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
                            dumpSingleJson: true,
                            noWarnings: true,
                            noCheckCertificates: true,
                            preferFreeFormats: true,
                        })

                        const videoInfo = {
                            title: info.title || '',
                            thumbnail: info.thumbnail || '',
                            channel: info.channel || info.uploader || '',
                            duration: formatDuration(info.duration || 0),
                        }

                        const seen = new Set()
                        const formats = (info.formats || [])
                            .filter(f => {
                                if (!f.format_id || seen.has(f.format_id)) return false
                                seen.add(f.format_id)
                                const hasVideo = f.vcodec && f.vcodec !== 'none'
                                const hasAudio = f.acodec && f.acodec !== 'none'
                                return hasVideo || hasAudio
                            })
                            .map(f => {
                                const hasVideo = f.vcodec && f.vcodec !== 'none'
                                const hasAudio = f.acodec && f.acodec !== 'none'
                                return {
                                    format_id: f.format_id,
                                    quality: f.format_note || f.resolution || 'Unknown',
                                    ext: f.ext || 'mp4',
                                    hasVideo,
                                    hasAudio,
                                    size: formatBytes(f.filesize || f.filesize_approx || 0),
                                }
                            })
                            .sort((a, b) => {
                                if (a.hasVideo && a.hasAudio && !(b.hasVideo && b.hasAudio)) return -1
                                if (!(a.hasVideo && a.hasAudio) && b.hasVideo && b.hasAudio) return 1
                                if (a.hasVideo && !b.hasVideo) return -1
                                if (!a.hasVideo && b.hasVideo) return 1
                                return 0
                            })

                        res.writeHead(200, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({ info: videoInfo, formats }))
                        return
                    }

                    if (url.pathname === '/api/download') {
                        const videoId = url.searchParams.get('v')
                        const formatId = url.searchParams.get('format_id')
                        const title = url.searchParams.get('title') || 'video'
                        const ext = url.searchParams.get('ext') || 'mp4'

                        if (!videoId || !formatId) {
                            res.writeHead(400, { 'Content-Type': 'application/json' })
                            res.end(JSON.stringify({ error: 'Missing params' }))
                            return
                        }

                        const rawName = decodeURIComponent(title)
                            .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
                            .substring(0, 80) || 'video'
                        const asciiName = rawName.replace(/[^\x20-\x7E]/g, '_') + '.' + ext
                        const utf8Name = encodeURIComponent(rawName + '.' + ext)

                        const args = [
                            `https://www.youtube.com/watch?v=${videoId}`,
                            '-f', formatId,
                            '-o', '-',
                            '--no-warnings',
                            '--no-check-certificates',
                        ]

                        const child = spawn(ytDlpBin, args)
                        let headersSent = false

                        child.stdout.on('data', (chunk) => {
                            if (!headersSent) {
                                headersSent = true
                                res.writeHead(200, {
                                    'Content-Type': 'application/octet-stream',
                                    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
                                })
                            }
                            res.write(chunk)
                        })

                        child.stderr.on('data', (data) => {
                            const msg = data.toString()
                            if (msg.includes('ERROR')) console.error('yt-dlp:', msg)
                        })

                        child.on('close', (code) => {
                            if (code !== 0 && !headersSent) {
                                res.writeHead(500, { 'Content-Type': 'application/json' })
                                res.end(JSON.stringify({ error: 'Download failed' }))
                            } else {
                                res.end()
                            }
                        })

                        child.on('error', (err) => {
                            console.error('spawn error:', err.message)
                            if (!headersSent) {
                                res.writeHead(500, { 'Content-Type': 'application/json' })
                                res.end(JSON.stringify({ error: 'Server error' }))
                            } else {
                                res.end()
                            }
                        })

                        req.on('close', () => {
                            if (!child.killed) child.kill()
                        })

                        return
                    }

                    next()
                } catch (err) {
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json' })
                        res.end(JSON.stringify({ error: err.message }))
                    }
                }
            })
        },
    }
}

export default defineConfig({
    plugins: [react(), downloadPlugin()],
})
