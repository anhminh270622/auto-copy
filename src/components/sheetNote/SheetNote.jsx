import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreViVN from '@univerjs/preset-sheets-core/locales/vi-VN';
import { UniverSheetsDataValidationPreset } from '@univerjs/preset-sheets-data-validation';
import UniverPresetSheetsDataValidationViVN from '@univerjs/preset-sheets-data-validation/locales/vi-VN';
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/preset-sheets-conditional-formatting';
import UniverPresetSheetsConditionalFormattingViVN from '@univerjs/preset-sheets-conditional-formatting/locales/vi-VN';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import UniverPresetSheetsFilterViVN from '@univerjs/preset-sheets-filter/locales/vi-VN';
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-data-validation/lib/index.css';
import '@univerjs/preset-sheets-conditional-formatting/lib/index.css';
import '@univerjs/preset-sheets-filter/lib/index.css';
import './SheetNote.css';
import {
    COL_PADDING,
    DEFAULT_COL_WIDTH,
    MAX_COL_WIDTH,
    MIN_COL_WIDTH,
    STATUS_CONDITIONS,
    STATUS_OPTIONS,
    countHtmlJunkInWorkbook,
    createEmptyWorkbook,
    generateId,
    loadSavedFiles,
    measureTextWidth,
    persistFiles,
    sanitizeUniverWorkbook,
    univerWorkbookToExportSheets,
} from './univerHelpers';

function UniverWrapper({ file, onDataChange, onApiReady, darkMode }) {
    const containerRef = useRef(null);
    const readyRef = useRef(false);
    const onDataChangeRef = useRef(onDataChange);
    const onApiReadyRef = useRef(onApiReady);
    const univerApiRef = useRef(null);
    const darkModeRef = useRef(darkMode);

    useEffect(() => {
        onDataChangeRef.current = onDataChange;
        onApiReadyRef.current = onApiReady;
    }, [onDataChange, onApiReady]);

    useEffect(() => {
        darkModeRef.current = darkMode;
        const sync = () => {
            univerApiRef.current?.toggleDarkMode?.(Boolean(darkMode));
            document.documentElement.classList.toggle('univer-dark', Boolean(darkMode));
        };
        sync();
        // Univer đôi khi gắn lại class sau 1 frame — sync lại
        const t = requestAnimationFrame(sync);
        return () => cancelAnimationFrame(t);
    }, [darkMode]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return undefined;

        readyRef.current = false;

        const { univer, univerAPI } = createUniver({
            darkMode: Boolean(darkModeRef.current),
            locale: LocaleType.VI_VN,
            locales: {
                [LocaleType.VI_VN]: mergeLocales(
                    UniverPresetSheetsCoreViVN,
                    UniverPresetSheetsDataValidationViVN,
                    UniverPresetSheetsConditionalFormattingViVN,
                    UniverPresetSheetsFilterViVN,
                ),
            },
            presets: [
                UniverSheetsCorePreset({
                    container,
                    header: true,
                    toolbar: true,
                    ribbonType: 'simple',
                    footer: {
                        sheetBar: true,
                        statisticBar: true,
                        menus: true,
                        zoomSlider: true,
                    },
                }),
                UniverSheetsDataValidationPreset(),
                UniverSheetsConditionalFormattingPreset(),
                UniverSheetsFilterPreset(),
            ],
        });

        univerApiRef.current = univerAPI;
        univerAPI.toggleDarkMode?.(Boolean(darkModeRef.current));
        document.documentElement.classList.toggle('univer-dark', Boolean(darkModeRef.current));

        const workbookData = file.workbook || createEmptyWorkbook(file.id, file.title);
        const fWorkbook = univerAPI.createWorkbook(workbookData);
        onApiReadyRef.current?.(file.id, { univerAPI, fWorkbook });

        const readyTimer = setTimeout(() => {
            readyRef.current = true;
        }, 800);

        const resizeTimers = [80, 250, 600].map((ms) =>
            setTimeout(() => window.dispatchEvent(new Event('resize')), ms)
        );

        // Không gọi save() đồng bộ từng phím — dễ kẹt edit mode / không click sang ô khác
        let editing = false;
        let persistTimer = null;
        const persistSnapshot = () => {
            if (!readyRef.current || editing) return;
            try {
                onDataChangeRef.current(file.id, fWorkbook.save());
            } catch (err) {
                console.error('Lỗi lưu sheet:', err);
            }
        };
        const schedulePersist = () => {
            if (persistTimer) clearTimeout(persistTimer);
            persistTimer = setTimeout(persistSnapshot, 450);
        };

        const dEditStart = univerAPI.Event?.SheetEditStarted
            ? univerAPI.addEvent(univerAPI.Event.SheetEditStarted, () => {
                editing = true;
                if (persistTimer) {
                    clearTimeout(persistTimer);
                    persistTimer = null;
                }
            })
            : { dispose() {} };
        const dEditEnd = univerAPI.Event?.SheetEditEnded
            ? univerAPI.addEvent(univerAPI.Event.SheetEditEnded, () => {
                editing = false;
                schedulePersist();
            })
            : { dispose() {} };
        const dCommand = fWorkbook.onCommandExecuted(() => {
            if (!readyRef.current || editing) return;
            schedulePersist();
        });

        return () => {
            clearTimeout(readyTimer);
            if (persistTimer) clearTimeout(persistTimer);
            resizeTimers.forEach(clearTimeout);
            dEditStart.dispose();
            dEditEnd.dispose();
            dCommand.dispose();
            // Flush lần cuối trước khi hủy
            try {
                if (readyRef.current) onDataChangeRef.current(file.id, fWorkbook.save());
            } catch {
                /* ignore */
            }
            onApiReadyRef.current?.(file.id, null);
            univerApiRef.current = null;
            document.documentElement.classList.remove('univer-dark');
            univer.dispose();
        };
    }, [file.id, file.title]);

    return (
        <div className="sheet-container">
            <div ref={containerRef} className="univer-host" />
        </div>
    );
}

export default function SheetNote({ theme = 'light' }) {
    const [files, setFiles] = useState(() => {
        const saved = loadSavedFiles();
        if (saved?.length) return saved;
        const id = generateId();
        return [{ id, title: 'File 1', workbook: createEmptyWorkbook(id, 'File 1') }];
    });

    const [activeFileId, setActiveFileId] = useState(files[0]?.id);
    const filesRef = useRef(files);
    const saveTimerRef = useRef(null);
    const workbookApiRefs = useRef({});
    const [workbookRefreshKey, setWorkbookRefreshKey] = useState(0);
    const activeFile = filesRef.current.find((f) => f.id === activeFileId) || filesRef.current[0];

    const handleApiReady = useCallback((fileId, apiBundle) => {
        if (apiBundle) workbookApiRefs.current[fileId] = apiBundle;
        else delete workbookApiRefs.current[fileId];
    }, []);

    const flushSave = useCallback(() => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        // Lấy snapshot đang edit trước khi đóng app
        const apiBundle = workbookApiRefs.current[activeFileId];
        if (apiBundle?.fWorkbook) {
            try {
                const snapshot = apiBundle.fWorkbook.save();
                filesRef.current = filesRef.current.map((f) =>
                    f.id === activeFileId ? { ...f, workbook: snapshot } : f
                );
            } catch {
                /* ignore */
            }
        }
        persistFiles(filesRef.current);
    }, [activeFileId]);

    const scheduleSave = useCallback(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            persistFiles(filesRef.current);
            saveTimerRef.current = null;
        }, 300);
    }, []);

    useEffect(() => {
        filesRef.current = files;
    }, [files]);

    useEffect(() => {
        const onPersist = () => flushSave();
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') onPersist();
        };
        window.addEventListener('beforeunload', onPersist);
        window.addEventListener('pagehide', onPersist);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('beforeunload', onPersist);
            window.removeEventListener('pagehide', onPersist);
            document.removeEventListener('visibilitychange', onVisibility);
            flushSave();
        };
    }, [flushSave]);

    const handleDataChange = useCallback((fileId, workbook) => {
        const junkCount = countHtmlJunkInWorkbook(workbook);
        const cleaned = junkCount > 0 ? sanitizeUniverWorkbook(workbook) : workbook;
        filesRef.current = filesRef.current.map((f) =>
            f.id === fileId ? { ...f, workbook: cleaned } : f
        );
        scheduleSave();
    }, [scheduleSave]);

    const commitFiles = useCallback((newFiles, { persistNow = true } = {}) => {
        filesRef.current = newFiles;
        setFiles(newFiles);
        if (persistNow) persistFiles(newFiles);
    }, []);

    const getLiveWorkbook = useCallback((fileId) => {
        const apiBundle = workbookApiRefs.current[fileId];
        if (apiBundle?.fWorkbook) {
            try {
                return apiBundle.fWorkbook.save();
            } catch {
                /* fallback below */
            }
        }
        return filesRef.current.find((f) => f.id === fileId)?.workbook;
    }, []);

    const autofitColumns = useCallback((fWorksheet, colIndexes) => {
        if (!fWorksheet) return;

        let indexes = colIndexes;
        const lastCol = fWorksheet.getLastColumn();
        const lastRow = fWorksheet.getLastRow();
        if (lastCol < 0 || lastRow < 0) return;

        if (!indexes || indexes.length === 0) {
            indexes = Array.from({ length: lastCol + 1 }, (_, i) => i);
        }

        indexes.forEach((colIndex) => {
            let maxWidth = DEFAULT_COL_WIDTH;
            for (let r = 0; r <= lastRow; r += 1) {
                const display = fWorksheet.getRange(r, colIndex).getDisplayValue();
                if (!display) continue;
                const measured = measureTextWidth(display, 10, false) + COL_PADDING;
                if (measured > maxWidth) maxWidth = measured;
            }
            fWorksheet.setColumnWidth(
                colIndex,
                Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.ceil(maxWidth)))
            );
        });
    }, []);

    const handleAutofitAll = useCallback(() => {
        const apiBundle = workbookApiRefs.current[activeFileId];
        const fWorksheet = apiBundle?.fWorkbook?.getActiveSheet?.();
        if (!fWorksheet) return;
        autofitColumns(fWorksheet, null);
    }, [activeFileId, autofitColumns]);

    const handleApplyStatus = useCallback(() => {
        const apiBundle = workbookApiRefs.current[activeFileId];
        const { univerAPI, fWorkbook } = apiBundle || {};
        const fWorksheet = fWorkbook?.getActiveSheet?.();
        if (!univerAPI || !fWorksheet) return;

        const selection = fWorksheet.getSelection();
        const activeRange = selection?.getActiveRange?.();
        if (!activeRange) {
            alert('Hãy chọn cột/vùng ô trạng thái trước (vd: click chữ cột U).');
            return;
        }

        const rule = univerAPI.newDataValidation()
            .requireValueInList(STATUS_OPTIONS, false, true)
            .setOptions({
                allowBlank: true,
                showErrorMessage: true,
                error: 'Chọn một trạng thái trong danh sách',
            })
            .build();
        activeRange.setDataValidation(rule);

        const rangeInfo = activeRange.getRange();
        STATUS_CONDITIONS.forEach(({ text, bg, fg }) => {
            const cfRule = fWorksheet.newConditionalFormattingRule()
                .whenTextEqualTo(text)
                .setBackground(bg)
                .setFontColor(fg)
                .setRanges([rangeInfo])
                .build();
            fWorksheet.addConditionalFormattingRule(cfRule);
        });

        handleDataChange(activeFileId, fWorkbook.save());
        alert('Đã gắn dropdown trạng thái. Click mũi tên ▾ trên ô để chọn.');
    }, [activeFileId, handleDataChange]);

    const handleAddFile = () => {
        const id = generateId();
        const newFile = {
            id,
            title: `File ${filesRef.current.length + 1}`,
            workbook: createEmptyWorkbook(id, `File ${filesRef.current.length + 1}`),
        };
        commitFiles([...filesRef.current, newFile]);
        setActiveFileId(newFile.id);
    };

    const handleDeleteFile = (id, e) => {
        e.stopPropagation();
        if (filesRef.current.length === 1) {
            alert('Phải có ít nhất 1 file!');
            return;
        }
        if (window.confirm('Bạn có chắc chắn muốn xóa file này không?')) {
            const newFiles = filesRef.current.filter((f) => f.id !== id);
            commitFiles(newFiles);
            if (activeFileId === id) setActiveFileId(newFiles[0].id);
        }
    };

    const handleRenameFile = (id, currentTitle) => {
        const newTitle = window.prompt('Nhập tên file mới:', currentTitle);
        if (newTitle && newTitle.trim()) {
            commitFiles(filesRef.current.map((f) =>
                f.id === id ? { ...f, title: newTitle.trim() } : f
            ));
        }
    };

    const handleExportExcel = () => {
        const currentActiveFile = filesRef.current.find((f) => f.id === activeFileId);
        const workbook = getLiveWorkbook(activeFileId);
        if (!currentActiveFile || !workbook) {
            alert('Không tìm thấy dữ liệu để xuất!');
            return;
        }

        const exportSheets = univerWorkbookToExportSheets(workbook);
        if (exportSheets.length === 0) {
            alert('Không tìm thấy dữ liệu để xuất!');
            return;
        }

        const wb = XLSX.utils.book_new();
        exportSheets.forEach((sheet, index) => {
            const ws = XLSX.utils.aoa_to_sheet(sheet.data);
            let sheetName = sheet.name || `Sheet${index + 1}`;
            if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        if (window.electronApp?.saveFileBase64) {
            const b64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
            window.electronApp.saveFileBase64({
                title: 'Lưu File Excel',
                defaultPath: `${currentActiveFile.title}.xlsx`,
                filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
            }, b64).catch((err) => {
                alert('Lỗi khi lưu file: ' + err.message);
            });
        } else {
            XLSX.writeFile(wb, `${currentActiveFile.title}.xlsx`);
        }
    };

    const handleClearData = () => {
        if (!window.confirm('Bạn có chắc chắn muốn làm mới (xóa toàn bộ) file hiện tại?')) return;
        const current = filesRef.current.find((f) => f.id === activeFileId);
        if (!current) return;
        commitFiles(filesRef.current.map((f) =>
            f.id === activeFileId
                ? { ...f, workbook: createEmptyWorkbook(f.id, f.title) }
                : f
        ));
        setWorkbookRefreshKey((n) => n + 1);
    };

    return (
        <div className={`sheet-wrapper sheet-wrapper--${theme === 'dark' ? 'dark' : 'light'}`}>
            <div className="file-tabs-container">
                {files.map((file) => (
                    <div
                        key={file.id}
                        className={`file-tab ${file.id === activeFileId ? 'active' : ''}`}
                        onClick={() => {
                            const live = getLiveWorkbook(activeFileId);
                            if (live && activeFileId !== file.id) {
                                filesRef.current = filesRef.current.map((f) =>
                                    f.id === activeFileId ? { ...f, workbook: live } : f
                                );
                            }
                            setFiles([...filesRef.current]);
                            setActiveFileId(file.id);
                        }}
                        onDoubleClick={() => handleRenameFile(file.id, file.title)}
                        title="Click đúp để đổi tên"
                    >
                        <span className="file-tab-title">{file.title}</span>
                        {files.length > 1 && (
                            <button className="file-tab-close" onClick={(ev) => handleDeleteFile(file.id, ev)}>✕</button>
                        )}
                    </div>
                ))}
                <button className="add-file-btn" onClick={handleAddFile} title="Tạo File Excel mới">+</button>
            </div>

            <div className="sheet-toolbar-custom">
                <button onClick={handleExportExcel} className="export-btn excel">📥 Tải Excel (.xlsx)</button>
                <button onClick={handleAutofitAll} className="export-btn autofit-btn" title="Tự dãn tất cả cột theo nội dung">
                    ↔️ Dãn cột
                </button>
                <button
                    onClick={handleApplyStatus}
                    className="export-btn status-btn"
                    title="Chọn cột trạng thái → gắn dropdown + màu ô"
                >
                    🏷️ Trạng thái
                </button>
                <button onClick={handleClearData} className="export-btn clear-btn" style={{ marginLeft: 'auto' }}>
                    🗑️ Xóa sạch
                </button>
            </div>

            {activeFile && (
                <UniverWrapper
                    key={`${activeFile.id}-${workbookRefreshKey}`}
                    file={activeFile}
                    onDataChange={handleDataChange}
                    onApiReady={handleApiReady}
                    darkMode={theme === 'dark'}
                />
            )}
        </div>
    );
}
