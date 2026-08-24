import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Workbook } from '@fortune-sheet/react';
import * as XLSX from 'xlsx';
import '@fortune-sheet/react/dist/index.css';
import './SheetNote.css';

const getInitialData = () => [{
    name: "Sheet1",
    status: 1,
    order: 0,
    celldata: [],
    config: {}
}];

const generateId = () => Math.random().toString(36).substr(2, 9);

// Mỗi file là một Workbook riêng biệt, được mount 1 lần và ẩn/hiện bằng CSS
function WorkbookWrapper({ file, isActive, onDataChange }) {
    const dataRef = useRef(file.data);

    const handleChange = useCallback((data) => {
        if (!data || data.length === 0) return;
        dataRef.current = data;
        onDataChange(file.id, data);
    }, [file.id, onDataChange]);

    // Lấy dữ liệu mới nhất từ ref
    useEffect(() => {
        // Expose ref qua callback khi component mount
    }, []);

    return (
        <div className="sheet-container" style={{ display: isActive ? 'block' : 'none' }}>
            <Workbook
                data={file.data}
                onChange={handleChange}
                lang="en"
            />
        </div>
    );
}

export default function SheetNote() {
    const [files, setFiles] = useState(() => {
        const savedData = localStorage.getItem('sheetNoteFiles');
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            } catch (error) {
                console.error("Lỗi khi đọc dữ liệu sheet:", error);
            }
        }
        return [{ id: generateId(), title: "File 1", data: getInitialData() }];
    });

    const [activeFileId, setActiveFileId] = useState(files[0]?.id);
    const filesRef = useRef(files);
    const saveTimerRef = useRef(null);

    useEffect(() => {
        filesRef.current = files;
    }, [files]);

    // Auto-save debounced
    const handleDataChange = useCallback((fileId, data) => {
        filesRef.current = filesRef.current.map(f =>
            f.id === fileId ? { ...f, data } : f
        );

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            try {
                localStorage.setItem('sheetNoteFiles', JSON.stringify(filesRef.current));
            } catch (error) {
                console.error("Lỗi khi lưu tự động:", error);
            }
        }, 500);
    }, []);

    const handleAddFile = () => {
        const newFile = { id: generateId(), title: `File ${filesRef.current.length + 1}`, data: getInitialData() };
        const newFiles = [...filesRef.current, newFile];
        filesRef.current = newFiles;
        setFiles(newFiles);
        setActiveFileId(newFile.id);
    };

    const handleDeleteFile = (id, e) => {
        e.stopPropagation();
        if (filesRef.current.length === 1) {
            alert("Phải có ít nhất 1 file!");
            return;
        }
        if (window.confirm("Bạn có chắc chắn muốn xóa file này không?")) {
            const newFiles = filesRef.current.filter(f => f.id !== id);
            filesRef.current = newFiles;
            setFiles(newFiles);
            if (activeFileId === id) {
                setActiveFileId(newFiles[0].id);
            }
        }
    };
    
    const handleRenameFile = (id, currentTitle) => {
        const newTitle = window.prompt("Nhập tên file mới:", currentTitle);
        if (newTitle && newTitle.trim()) {
            const newFiles = filesRef.current.map(f => f.id === id ? { ...f, title: newTitle.trim() } : f);
            filesRef.current = newFiles;
            setFiles(newFiles);
        }
    };

    const handleExportExcel = () => {
        const currentActiveFile = filesRef.current.find(f => f.id === activeFileId);
        if (!currentActiveFile || !currentActiveFile.data || currentActiveFile.data.length === 0) {
            alert("Không tìm thấy dữ liệu để xuất!");
            return;
        }

        const wb = XLSX.utils.book_new();

        currentActiveFile.data.forEach((sheet, index) => {
            let dataArray = [];

            if (sheet.data && sheet.data.length > 0) {
                dataArray = sheet.data.map(row => {
                    return row.map(cell => {
                        if (!cell) return "";
                        // 2D array format: cell có m, v trực tiếp ở top level
                        if (cell.m !== undefined) return cell.m;
                        if (cell.v !== undefined) return cell.v;
                        return "";
                    });
                });
            } else if (sheet.celldata && sheet.celldata.length > 0) {
                const maxRow = Math.max(...sheet.celldata.map(c => c.r), 0);
                const maxCol = Math.max(...sheet.celldata.map(c => c.c), 0);
                dataArray = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(""));
                sheet.celldata.forEach(cell => {
                    if (cell.v) {
                        // Sparse format: giá trị nằm trong cell.v.m hoặc cell.v.v
                        dataArray[cell.r][cell.c] = cell.v.m !== undefined ? cell.v.m : (cell.v.v !== undefined ? cell.v.v : "");
                    }
                });
            }

            const ws = XLSX.utils.aoa_to_sheet(dataArray);
            let sheetName = sheet.name || `Sheet${index + 1}`;
            if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
        
        if (window.electronApp && window.electronApp.saveFileBase64) {
            const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
            window.electronApp.saveFileBase64({
                title: "Lưu File Excel",
                defaultPath: `${currentActiveFile.title}.xlsx`,
                filters: [{ name: "Excel Files", extensions: ["xlsx"] }]
            }, b64).then(res => {
                if (!res.ok) console.log("Hủy lưu file");
            }).catch(err => {
                alert("Lỗi khi lưu file: " + err.message);
            });
        } else {
            XLSX.writeFile(wb, `${currentActiveFile.title}.xlsx`);
        }
    };

    const handleExportJson = () => {
        const currentActiveFile = filesRef.current.find(f => f.id === activeFileId);
        if (!currentActiveFile) return;
        const jsonStr = JSON.stringify(currentActiveFile.data);
        if (window.electronApp && window.electronApp.saveFileBase64) {
            const base64Data = btoa(unescape(encodeURIComponent(jsonStr)));
            window.electronApp.saveFileBase64({
                title: "Lưu Backup Sheet",
                defaultPath: `${currentActiveFile.title}_Backup.json`,
                filters: [{ name: "JSON Files", extensions: ["json"] }]
            }, base64Data).catch(err => {
                alert("Lỗi khi lưu file: " + err.message);
            });
        } else {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonStr);
            const a = document.createElement('a');
            a.href = dataStr;
            a.download = `${currentActiveFile.title}_Backup.json`;
            a.click();
        }
    };

    const handleImportJson = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                if (Array.isArray(parsed)) {
                    const newFiles = filesRef.current.map(f =>
                        f.id === activeFileId ? { ...f, data: parsed, title: file.name.replace('.json', '') } : f
                    );
                    filesRef.current = newFiles;
                    setFiles(newFiles);
                } else {
                    alert("File backup không đúng định dạng!");
                }
            } catch (err) {
                alert("Lỗi khi đọc file: " + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = null;
    };

    const handleClearData = () => {
        if (window.confirm("Bạn có chắc chắn muốn làm mới (xóa toàn bộ) file hiện tại?")) {
            const newFiles = filesRef.current.map(f =>
                f.id === activeFileId ? { ...f, data: getInitialData() } : f
            );
            filesRef.current = newFiles;
            setFiles(newFiles);
        }
    };

    return (
        <div className="sheet-wrapper">
            <div className="file-tabs-container">
                {files.map(file => (
                    <div 
                        key={file.id} 
                        className={`file-tab ${file.id === activeFileId ? 'active' : ''}`}
                        onClick={() => setActiveFileId(file.id)}
                        onDoubleClick={() => handleRenameFile(file.id, file.title)}
                        title="Click đúp để đổi tên"
                    >
                        <span className="file-tab-title">{file.title}</span>
                        {files.length > 1 && (
                            <button className="file-tab-close" onClick={(e) => handleDeleteFile(file.id, e)}>✕</button>
                        )}
                    </div>
                ))}
                <button className="add-file-btn" onClick={handleAddFile} title="Tạo File Excel mới">+</button>
            </div>

            <div className="sheet-toolbar-custom">
                <button onClick={handleExportExcel} className="export-btn excel">📥 Tải Excel (.xlsx)</button>
                <button onClick={handleExportJson} className="export-btn json">💾 Tải Backup (.json)</button>
                
                <label className="export-btn import-btn">
                    📂 Nhập Backup (.json)
                    <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJson} />
                </label>
                
                <button onClick={handleClearData} className="export-btn clear-btn" style={{ marginLeft: 'auto' }}>
                    🗑️ Xóa sạch dữ liệu
                </button>
            </div>
            
            {/* Render tất cả Workbook cùng lúc, ẩn/hiện bằng CSS thay vì destroy/remount */}
            {files.map(file => (
                <WorkbookWrapper
                    key={file.id}
                    file={file}
                    isActive={file.id === activeFileId}
                    onDataChange={handleDataChange}
                />
            ))}
        </div>
    );
}
