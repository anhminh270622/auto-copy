import React, { useState } from 'react';
import "./downloadYtb.css"

const YoutubeThumbnail = () => {
    const [youtubeURL, setYoutubeURL] = useState('');
    const [thumbnailUrl, setThumbnailUrl] = useState('');
    const [error, setError] = useState('');

    const getVideoId = (url) => {
        const regex = /(?:v=|\/)([0-9A-Za-z_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    };
    const handlePaste = async (e) => {
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');

        setTimeout(() => {
            getThumbnailByURL(pastedText);
        }, 100);
    };

    const getThumbnail = async () => {
        await getThumbnailByURL(youtubeURL);
    };
    const onReset = () => {
        setYoutubeURL('');
        setThumbnailUrl('');
        setError('');
    }
    const getThumbnailByURL = async (url) => {
        setError('');
        setThumbnailUrl('');
        const videoId = getVideoId(url);
        if (!videoId) {
            setError('Nhập link vào đê !');
            return;
        }

        const qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default'];
        for (let q of qualities) {
            const thumbUrl = `https://img.youtube.com/vi/${videoId}/${q}.jpg`;
            try {
                const res = await fetch(thumbUrl, { method: 'HEAD' });
                if (res.ok) {
                    setThumbnailUrl(thumbUrl);
                    setYoutubeURL("")
                    return;
                }
            } catch (err) {
                console.log(err)
            }
        }

        setError('Không tìm thấy hình thu nhỏ cho video này.');
    };


    return (
        <div className="downloadYtb-container">
            <h2 style={{ textAlign: "left" }}>Ảnh thumbnail từ video YouTube</h2>
            <div className="form-input">
                <input
                    onChange={(e) => {
                        setError('');
                        setYoutubeURL(e.target.value)
                    }
                    }
                    value={youtubeURL}
                    placeholder="Paste link YouTube tại đây"
                    className="input"
                    onPaste={handlePaste}
                />
                <button
                    onClick={thumbnailUrl ? onReset : getThumbnail}
                    className={`button ${thumbnailUrl ? 'button-secondary' : ''}`}
                >
                    {thumbnailUrl ? '🔁 Nhập lại' : 'Nhận ảnh thumbnail'}
                </button>
            </div>
            {thumbnailUrl && (
                <div className="thumbnailPreview">
                    <h3>Kết quả ảnh thumbnail tốt nhất:</h3>
                    <img src={thumbnailUrl} alt="Hình thu nhỏ YouTube" className="thumbnail-image" />
                </div>
            )}

            {error && <p className="error">{error}</p>}
        </div>
    );
};

export default YoutubeThumbnail;
