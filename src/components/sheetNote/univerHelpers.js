import * as XLSX from 'xlsx';

export const STORAGE_KEY_V2 = 'sheetNoteFiles_v2';
export const STORAGE_KEY_V1 = 'sheetNoteFiles';

export const DEFAULT_ROW_COUNT = 84;
export const DEFAULT_COL_COUNT = 60;

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const STATUS_OPTIONS = [
    'Chưa xử lý',
    'Đang xử lý',
    'Hoàn thành',
    'Chờ duyệt',
    'Hủy',
];

export const STATUS_CONDITIONS = [
    { text: 'Chưa xử lý', bg: '#fce8cd', fg: '#7a4e00' },
    { text: 'Đang xử lý', bg: '#cfe2ff', fg: '#084298' },
    { text: 'Hoàn thành', bg: '#d1e7dd', fg: '#0f5132' },
    { text: 'Chờ duyệt', bg: '#e2d9f3', fg: '#432874' },
    { text: 'Hủy', bg: '#f8d7da', fg: '#842029' },
];

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;
const EMPTY_RICH_HTML_RE = /^<(?:font|span|p|div|b|i|u|strong|em)\b[^>]*>\s*(?:<(?:br|\/?font|\/?span)\b[^>]*>|&nbsp;|\s)*<\/(?:font|span|p|div|b|i|u|strong|em)>$/i;

export const htmlToPlainText = (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (!HTML_TAG_RE.test(trimmed)) return value;

    if (EMPTY_RICH_HTML_RE.test(trimmed) || /^<(?:br\s*\/?|hr\s*\/?)>$/i.test(trimmed)) {
        return '';
    }

    try {
        const doc = new DOMParser().parseFromString(trimmed, 'text/html');
        return (doc.body?.textContent || '').replace(/\u00a0/g, ' ').trim();
    } catch {
        return trimmed
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .trim();
    }
};

const getCellPlainValue = (cell) => {
    if (cell == null) return '';
    if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
        return String(cell);
    }
    if (typeof cell.v === 'string' || typeof cell.v === 'number' || typeof cell.v === 'boolean') {
        return String(cell.v);
    }
    if (typeof cell.m === 'string' || typeof cell.m === 'number') {
        return String(cell.m);
    }
    return '';
};

export const isUniverWorkbook = (data) =>
    Boolean(data && typeof data === 'object' && data.sheets && Array.isArray(data.sheetOrder));

export const isFortuneSheetArray = (data) =>
    Array.isArray(data) &&
    data.length > 0 &&
    data.every((sheet) => sheet && typeof sheet === 'object' && ('celldata' in sheet || 'data' in sheet || 'name' in sheet));

export const createEmptyWorkbook = (workbookId, title = 'Workbook') => ({
    id: workbookId,
    name: title,
    sheetOrder: ['sheet-0'],
    sheets: {
        'sheet-0': {
            id: 'sheet-0',
            name: 'Sheet1',
            cellData: {},
            rowCount: DEFAULT_ROW_COUNT,
            columnCount: DEFAULT_COL_COUNT,
        },
    },
    styles: {},
});

export const fortuneSheetsToUniver = (sheets, workbookId, title = 'Workbook') => {
    const sheetOrder = [];
    const univerSheets = {};

    (sheets || []).forEach((sheet, index) => {
        const sheetId = `sheet-${index}`;
        sheetOrder.push(sheetId);
        const cellData = {};

        const putCell = (r, c, rawValue) => {
            let value = rawValue;
            if (typeof value === 'string') value = htmlToPlainText(value);
            if (value === '' || value == null) return;
            if (!cellData[r]) cellData[r] = {};
            cellData[r][c] = { v: value };
        };

        if (Array.isArray(sheet?.celldata)) {
            sheet.celldata.forEach((item) => {
                if (!item || !Number.isInteger(item.r) || !Number.isInteger(item.c)) return;
                const inner = item.v;
                if (inner && typeof inner === 'object') {
                    putCell(item.r, item.c, inner.m ?? inner.v ?? '');
                } else {
                    putCell(item.r, item.c, inner ?? '');
                }
            });
        }

        if (Array.isArray(sheet?.data)) {
            sheet.data.forEach((row, r) => {
                if (!Array.isArray(row)) return;
                row.forEach((cell, c) => {
                    if (cell == null) return;
                    if (typeof cell === 'object') {
                        putCell(r, c, cell.m ?? cell.v ?? '');
                    } else {
                        putCell(r, c, cell);
                    }
                });
            });
        }

        let maxRow = 0;
        let maxCol = 0;
        Object.keys(cellData).forEach((r) => {
            maxRow = Math.max(maxRow, Number(r));
            Object.keys(cellData[r]).forEach((c) => {
                maxCol = Math.max(maxCol, Number(c));
            });
        });

        univerSheets[sheetId] = {
            id: sheetId,
            name: sheet?.name || `Sheet${index + 1}`,
            cellData,
            rowCount: Math.max(sheet?.row || 0, maxRow + 20, DEFAULT_ROW_COUNT),
            columnCount: Math.max(sheet?.column || 0, maxCol + 5, DEFAULT_COL_COUNT),
        };
    });

    if (sheetOrder.length === 0) {
        const sheetId = 'sheet-0';
        sheetOrder.push(sheetId);
        univerSheets[sheetId] = {
            id: sheetId,
            name: 'Sheet1',
            cellData: {},
            rowCount: DEFAULT_ROW_COUNT,
            columnCount: DEFAULT_COL_COUNT,
        };
    }

    return {
        id: workbookId,
        name: title,
        sheetOrder,
        sheets: univerSheets,
        styles: {},
        locale: 'enUS',
    };
};

export const sanitizeUniverCellValue = (value) => {
    if (typeof value === 'string' && HTML_TAG_RE.test(value)) {
        return htmlToPlainText(value);
    }
    return value;
};

export const sanitizeUniverWorkbook = (workbook) => {
    if (!workbook?.sheets) return workbook;
    const next = { ...workbook, sheets: { ...workbook.sheets } };
    let changed = false;

    Object.entries(next.sheets).forEach(([sheetId, sheet]) => {
        if (!sheet?.cellData) return;
        const nextCellData = { ...sheet.cellData };
        Object.entries(nextCellData).forEach(([r, rowObj]) => {
            const nextRow = { ...rowObj };
            Object.entries(nextRow).forEach(([c, cell]) => {
                if (!cell || cell.v == null) return;
                const cleaned = sanitizeUniverCellValue(cell.v);
                if (cleaned === '' || cleaned == null) {
                    delete nextRow[c];
                    changed = true;
                    return;
                }
                if (cleaned !== cell.v) {
                    nextRow[c] = { ...cell, v: cleaned };
                    changed = true;
                }
            });
            if (Object.keys(nextRow).length === 0) delete nextCellData[r];
            else nextCellData[r] = nextRow;
        });
        next.sheets[sheetId] = { ...sheet, cellData: nextCellData };
    });

    return changed ? next : workbook;
};

export const countHtmlJunkInWorkbook = (workbook) => {
    let count = 0;
    Object.values(workbook?.sheets || {}).forEach((sheet) => {
        Object.values(sheet?.cellData || {}).forEach((rowObj) => {
            Object.values(rowObj || {}).forEach((cell) => {
                if (typeof cell?.v === 'string' && HTML_TAG_RE.test(cell.v)) count += 1;
            });
        });
    });
    return count;
};

export const workbookHasContent = (workbook) => {
    if (!workbook?.sheets) return false;
    return Object.values(workbook.sheets).some((sheet) =>
        Object.values(sheet?.cellData || {}).some((rowObj) =>
            Object.values(rowObj || {}).some((cell) => getCellPlainValue(cell) !== '')
        )
    );
};

export const univerWorkbookToExportSheets = (workbook) =>
    (workbook?.sheetOrder || []).map((sheetId, index) => {
        const sheet = workbook.sheets?.[sheetId] || {};
        const cellData = sheet.cellData || {};
        let maxRow = 0;
        let maxCol = 0;

        Object.keys(cellData).forEach((r) => {
            maxRow = Math.max(maxRow, Number(r));
            Object.keys(cellData[r] || {}).forEach((c) => {
                maxCol = Math.max(maxCol, Number(c));
            });
        });

        const dataArray = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(''));
        Object.entries(cellData).forEach(([r, rowObj]) => {
            Object.entries(rowObj || {}).forEach(([c, cell]) => {
                dataArray[Number(r)][Number(c)] = getCellPlainValue(cell);
            });
        });

        return {
            name: sheet.name || `Sheet${index + 1}`,
            data: dataArray,
        };
    });

export const xlsxToUniverWorkbook = (wb, workbookId, title = 'Workbook') => {
    const sheetOrder = [];
    const sheets = {};

    wb.SheetNames.forEach((name, index) => {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], {
            header: 1,
            defval: '',
            raw: false,
        });
        const sheetId = `sheet-${index}`;
        const cellData = {};

        aoa.forEach((row, r) => {
            (row || []).forEach((value, c) => {
                const cleaned = htmlToPlainText(String(value ?? ''));
                if (!cleaned) return;
                if (!cellData[r]) cellData[r] = {};
                cellData[r][c] = { v: cleaned };
            });
        });

        sheetOrder.push(sheetId);
        sheets[sheetId] = {
            id: sheetId,
            name,
            cellData,
            rowCount: Math.max(aoa.length + 20, DEFAULT_ROW_COUNT),
            columnCount: Math.max(
                aoa.reduce((max, row) => Math.max(max, (row || []).length), 0) + 5,
                DEFAULT_COL_COUNT
            ),
        };
    });

    return {
        id: workbookId,
        name: title,
        sheetOrder,
        sheets,
        styles: {},
        locale: 'enUS',
    };
};

export const normalizeStoredFile = (file) => {
    if (!file || typeof file !== 'object') return null;
    const id = file.id || generateId();
    const title = file.title || 'File 1';

    if (file.workbook && isUniverWorkbook(file.workbook)) {
        return { id, title, workbook: file.workbook };
    }
    if (isUniverWorkbook(file)) {
        return { id, title, workbook: file };
    }
    if (isFortuneSheetArray(file.data)) {
        return { id, title, workbook: fortuneSheetsToUniver(file.data, id, title) };
    }
    if (isFortuneSheetArray(file)) {
        return { id, title, workbook: fortuneSheetsToUniver(file, id, title) };
    }

    return { id, title, workbook: createEmptyWorkbook(id, title) };
};

export const loadSavedFiles = () => {
    try {
        const savedV2 = localStorage.getItem(STORAGE_KEY_V2);
        if (savedV2) {
            const parsed = JSON.parse(savedV2);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map(normalizeStoredFile).filter(Boolean);
            }
        }

        const savedV1 = localStorage.getItem(STORAGE_KEY_V1);
        if (savedV1) {
            const parsed = JSON.parse(savedV1);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map(normalizeStoredFile).filter(Boolean);
            }
        }
    } catch (error) {
        console.error('Lỗi khi đọc dữ liệu sheet:', error);
    }
    return null;
};

export const persistFiles = (files) => {
    try {
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(files));
        return true;
    } catch (error) {
        console.error('Lỗi khi lưu sheet:', error);
        const isQuota = error?.name === 'QuotaExceededError' || /quota/i.test(String(error?.message || ''));
        if (isQuota) {
            alert('Không lưu được sheet: bộ nhớ trình duyệt đầy. Hãy xóa bớt dữ liệu hoặc xuất Excel rồi Xóa sạch.');
        }
        return false;
    }
};

export const DEFAULT_COL_WIDTH = 73;
export const MIN_COL_WIDTH = 40;
export const MAX_COL_WIDTH = 520;
export const COL_PADDING = 18;

export const measureTextWidth = (() => {
    let canvas;
    return (text, fontSizePt = 10, bold = false) => {
        if (!canvas) canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.font = `${bold ? 'bold ' : ''}${fontSizePt}pt Arial, Helvetica, sans-serif`;
        return ctx.measureText(text).width;
    };
})();
