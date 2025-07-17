import React, { useState, useRef, useEffect } from 'react';
import './ImgToVideoConvert.css';

const ImageToVideoConverter = () => {
    const [processing, setProcessing] = useState(false);
    const [videoUrl, setVideoUrl] = useState(null);
    const [error, setError] = useState(null);
    const [videoExtension, setVideoExtension] = useState('mp4');
    const [timeVideo, setTimeVideo] = useState(15);
    const canvasRef = useRef(null);
    // Thay vì animationFrameId, chúng ta dùng intervalId để có thể hủy nó
    const intervalId = useRef(null);
    const recorderRef = useRef(null);

    const onReset = () => {
        setVideoUrl(null);
        setError(null);
        setProcessing(false);
        if (recorderRef.current && recorderRef.current.state === 'recording') {
            recorderRef.current.stop();
        }
        if (intervalId.current) {
            clearInterval(intervalId.current);
        }
    };

    const handleConvertToVideo = (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) {
            setError("Vui lòng chọn một file ảnh.");
            return;
        }

        const imageFile = files[0];
        if (!imageFile.type.startsWith('image/')) {
            setError("File được chọn không phải là ảnh.");
            return;
        }
        setError(null);
        setVideoUrl(null);
        setProcessing(true);

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = canvasRef.current;
                if (!canvas) {
                    setError("Không thể truy cập canvas.");
                    setProcessing(false);
                    return;
                }

                // Đảm bảo kích thước canvas hợp lệ
                canvas.width = img.width % 2 === 0 ? img.width : img.width + 1;
                canvas.height = img.height % 2 === 0 ? img.height : img.height + 1;


                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    setError("Không thể lấy context 2D.");
                    setProcessing(false);
                    return;
                }

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                startRecording(canvas, img);
            };
            img.onerror = () => {
                setError("Không thể tải ảnh.");
                setProcessing(false);
            };
            img.src = e.target?.result;
        };
        reader.onerror = () => {
            setError("Không thể đọc file.");
            setProcessing(false);
        };
        reader.readAsDataURL(imageFile);
    };

    const handleChangeTime = (e) => {
        setTimeVideo(e.target.value);
    };

    // Hàm startRecording được viết lại hoàn toàn để xử lý trong nền
    const startRecording = (canvas, image) => {
        const stream = canvas.captureStream(30); // 30 FPS
        if (!window.MediaRecorder) {
            setError("Trình duyệt không hỗ trợ MediaRecorder.");
            setProcessing(false);
            return;
        }

        let mimeType = 'video/mp4';
        let extension = 'mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
            extension = 'webm';
        }
        setVideoExtension(extension);

        const recorder = new MediaRecorder(stream, { mimeType });
        recorderRef.current = recorder;
        const chunks = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            // Dọn dẹp interval khi dừng
            if (intervalId.current) clearInterval(intervalId.current);

            const blob = new Blob(chunks, { type: mimeType });
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);
            setProcessing(false);
            stream.getTracks().forEach((track) => track.stop());
        };

        recorder.onerror = (e) => {
            // Dọn dẹp interval khi có lỗi
            if (intervalId.current) clearInterval(intervalId.current);
            setError("Lỗi MediaRecorder: " + e.error?.name);
            setProcessing(false);
        };

        recorder.start();

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Ghi lại thời điểm bắt đầu
        const startTime = performance.now();
        const duration = timeVideo * 1000 + 1000; // Thời lượng video bằng mili giây

        // Sử dụng setInterval thay cho requestAnimationFrame
        intervalId.current = setInterval(() => {
            const elapsedTime = performance.now() - startTime;

            // Kiểm tra nếu đã đủ thời gian
            if (elapsedTime >= duration) {
                if (recorder.state === 'recording') {
                    recorder.stop();
                }
                clearInterval(intervalId.current);
                return;
            }

            // Vẫn vẽ lại ảnh để đảm bảo stream luôn có dữ liệu
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        }, 100); // Chạy mỗi 100ms là đủ để giữ cho stream hoạt động
    };

    // Dọn dẹp khi component bị unmount
    useEffect(() => {
        return () => {
            if (intervalId.current) {
                clearInterval(intervalId.current);
            }
        };
    }, []);

    return (
        <div className="container-converter">
            <div className="card">
                <h2 className="title">Chuyển Ảnh thành Video</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', justifyContent: 'space-between' }}>
                    <div className="select-wrapper">
                        <label htmlFor="duration">Chọn thời lượng video:</label>
                        <select id="duration" onChange={handleChangeTime} value={timeVideo}>
                            <option value="5">5 giây</option>
                            <option value="10">10 giây</option>
                            <option value="15">15 giây</option>
                            <option value="20">20 giây</option>
                        </select>
                    </div>
                    <div className="upload-label">
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                            <button
                                disabled={!videoUrl && !processing}
                                className={!videoUrl && !processing ? "btn-disable" : ""}
                                onClick={onReset}>
                                🔁 {processing ? 'Hủy' : 'Nhập lại'}
                            </button>
                            <label htmlFor="image-upload"
                                   className={`upload-btn ${processing ? 'disabled' : ''}`}>
                                {processing ? 'Đang xử lý...' : 'Chọn Ảnh'}
                            </label>
                        </div>
                        <input
                            id="image-upload"
                            type="file"
                            accept="image/*"
                            onChange={handleConvertToVideo}
                            className="hidden"
                            disabled={processing}
                        />
                    </div>
                </div>
                {processing && (
                    <div className="loading">
                        <div className="spinner" />
                        <span>Đang tạo video... Vui lòng đợi.</span>
                    </div>
                )}

                {error && <div className="error">Lỗi: {error}</div>}

                {videoUrl && (
                    <div className="result-convert" style={{ marginTop: '16px' }}>
                        <h2 className="success-title">Video đã sẵn sàng!</h2>
                        <video
                            src={videoUrl}
                            controls
                            autoPlay
                            muted
                            loop
                            className="video-preview"
                        />
                        <a
                            href={videoUrl}
                            download={`static_video.${videoExtension}`}
                            className="download-btn"
                        >
                            Tải Video (.{videoExtension})
                        </a>
                    </div>
                )}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
        </div>
    );
};

export default ImageToVideoConverter;