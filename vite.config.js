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

function formatTranscriptTime(totalSeconds) {
    const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0))
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
}

function decodeHtmlEntities(input) {
    return String(input || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
}

function cleanTranscriptText(input) {
    return decodeHtmlEntities(input)
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function parseVttTranscript(rawText) {
    const lines = String(rawText || '').split(/\r?\n/)
    const items = []
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim()
        if (!line.includes('-->')) continue
        const [start] = line.split('-->')
        const parts = start.trim().split(':').map((x) => Number(x.replace(',', '.')))
        let seconds = 0
        if (parts.length === 3) {
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
        } else if (parts.length === 2) {
            seconds = parts[0] * 60 + parts[1]
        } else {
            continue
        }
        const textParts = []
        for (let j = i + 1; j < lines.length; j += 1) {
            const t = lines[j]
            if (!t.trim()) break
            textParts.push(t.trim())
        }
        const text = cleanTranscriptText(textParts.join(' '))
        if (!text) continue
        items.push({ time: formatTranscriptTime(seconds), text })
    }
    return items
}

function parseJson3Transcript(payload) {
    const events = Array.isArray(payload?.events) ? payload.events : []
    const items = []
    for (const event of events) {
        const startMs = Number(event?.tStartMs)
        if (!Number.isFinite(startMs)) continue
        const segs = Array.isArray(event?.segs) ? event.segs : []
        const text = cleanTranscriptText(segs.map((seg) => seg?.utf8 || '').join(''))
        if (!text) continue
        items.push({
            time: formatTranscriptTime(startMs / 1000),
            text,
        })
    }
    return items
}

function pickCaptionTrack(info, preferredLang = 'auto') {
    const pools = [
        { kind: 'subtitles', tracks: info?.subtitles || {} },
        { kind: 'automatic', tracks: info?.automatic_captions || {} },
    ]
    const preferred = String(preferredLang || 'auto').toLowerCase()
    const langPriorityByPref = {
        vi: ['vi', 'vi-VN', 'vi-vn', 'en', 'en-US', 'en-us'],
        en: ['en', 'en-US', 'en-us', 'vi', 'vi-VN', 'vi-vn'],
        auto: ['vi', 'vi-VN', 'vi-vn', 'en', 'en-US', 'en-us'],
    }
    const langPriority = langPriorityByPref[preferred] || langPriorityByPref.auto
    const extPriority = ['json3', 'vtt', 'srv3', 'srv2', 'srv1', 'ttml']

    for (const pool of pools) {
        for (const lang of langPriority) {
            const entries = Array.isArray(pool.tracks?.[lang]) ? pool.tracks[lang] : []
            if (!entries.length) continue
            const pickedByExt =
                extPriority
                    .map((ext) => entries.find((entry) => entry?.ext === ext && entry?.url))
                    .find(Boolean) || entries.find((entry) => entry?.url)
            if (pickedByExt) return { ...pickedByExt, lang, kind: pool.kind }
        }
    }

    for (const pool of pools) {
        const langs = Object.keys(pool.tracks || {})
        for (const lang of langs) {
            const entries = Array.isArray(pool.tracks?.[lang]) ? pool.tracks[lang] : []
            const picked = entries.find((entry) => entry?.url)
            if (picked) return { ...picked, lang, kind: pool.kind }
        }
    }
    return null
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
                        let info
                        try {
                            info = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
                                dumpSingleJson: true,
                                noWarnings: true,
                                noCheckCertificates: true,
                                preferFreeFormats: true,
                            })
                        } catch (err) {
                            const message = String(err?.message || '')
                            const isUnavailable =
                                /video unavailable|private video|sign in|age-restricted|members-only|not available/i.test(message)
                            res.writeHead(isUnavailable ? 422 : 500, { 'Content-Type': 'application/json' })
                            res.end(
                                JSON.stringify({
                                    error: isUnavailable
                                        ? 'Video này không thể tải (riêng tư/giới hạn khu vực/cần đăng nhập).'
                                        : 'Không thể lấy thông tin video từ YouTube.',
                                }),
                            )
                            return
                        }

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
                        let stderrOutput = ''

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
                            stderrOutput += msg
                            if (stderrOutput.length > 4000) {
                                stderrOutput = stderrOutput.slice(-4000)
                            }
                            if (msg.includes('ERROR')) console.error('yt-dlp:', msg)
                        })

                        child.on('close', (code) => {
                            if (code !== 0 && !headersSent) {
                                const isUnavailable =
                                    /video unavailable|private video|sign in|age-restricted|members-only|not available/i.test(stderrOutput)
                                res.writeHead(isUnavailable ? 422 : 500, { 'Content-Type': 'application/json' })
                                res.end(
                                    JSON.stringify({
                                        error: isUnavailable
                                            ? 'Video này không thể tải (riêng tư/giới hạn khu vực/cần đăng nhập).'
                                            : 'Download failed',
                                    }),
                                )
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

                    if (url.pathname === '/api/transcript') {
                        const videoId = url.searchParams.get('v')
                        const lang = String(url.searchParams.get('lang') || 'auto').toLowerCase()
                        if (!videoId) {
                            res.writeHead(400, { 'Content-Type': 'application/json' })
                            res.end(JSON.stringify({ error: 'Missing video ID' }))
                            return
                        }

                        const youtubedl = (await import('youtube-dl-exec')).default
                        let info
                        try {
                            info = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
                                dumpSingleJson: true,
                                noWarnings: true,
                                noCheckCertificates: true,
                                preferFreeFormats: true,
                            })
                        } catch {
                            res.writeHead(200, { 'Content-Type': 'application/json' })
                            res.end(
                                JSON.stringify({
                                    transcript: '',
                                    lines: [],
                                    message: 'Không thể lấy bản chép lời cho video này.',
                                }),
                            )
                            return
                        }

                        const track = pickCaptionTrack(info, lang)
                        if (!track?.url) {
                            res.writeHead(200, { 'Content-Type': 'application/json' })
                            const message =
                                lang === 'en'
                                    ? 'Không tìm thấy bản chép lời tiếng Anh cho video này.'
                                    : lang === 'vi'
                                      ? 'Không tìm thấy bản chép lời tiếng Việt cho video này.'
                                      : 'Không tìm thấy bản chép lời.'
                            res.end(JSON.stringify({ transcript: '', lines: [], message }))
                            return
                        }

                        const transcriptRes = await fetch(track.url)
                        if (!transcriptRes.ok) {
                            res.writeHead(200, { 'Content-Type': 'application/json' })
                            res.end(
                                JSON.stringify({
                                    transcript: '',
                                    lines: [],
                                    message: 'Không thể tải bản chép lời cho video này.',
                                }),
                            )
                            return
                        }

                        const isJson =
                            String(track.ext || '').toLowerCase() === 'json3' ||
                            (transcriptRes.headers.get('content-type') || '').includes('application/json')
                        const lines = isJson
                            ? parseJson3Transcript(await transcriptRes.json())
                            : parseVttTranscript(await transcriptRes.text())
                        res.writeHead(200, { 'Content-Type': 'application/json' })
                        res.end(
                            JSON.stringify({
                                transcript: lines.map((line) => `${line.time} ${line.text}`).join('\n'),
                                lines,
                                language: track.lang || '',
                                source: track.kind || '',
                            }),
                        )
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

export default defineConfig(() => {
    return {
        base: './',
        plugins: [react(), downloadPlugin()],
    }
})
