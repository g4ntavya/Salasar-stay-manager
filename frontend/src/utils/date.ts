export const monthKey = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}`;
};

export const buildMonthSeries = (monthsCount: number = 12): string[] => {
    const series: string[] = [];
    const now = new Date();
    for (let i = monthsCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        series.push(monthKey(d));
    }
    return series;
};

export const formatMonthLabel = (key: string): string => {
    const [year, month] = key.split('-');
    const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    return `${monthNames[parseInt(month, 10) - 1]} ${year.slice(2)}`;
};

/** Local calendar day as YYYY-MM-DD ('' for invalid input). Used as database keys and range bounds. */
export const localDay = (date: Date | string | number = new Date()): string => {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** YYYY-MM-DD shifted by a number of days (local time). */
export const addDays = (day: string, days: number): string => {
    const [y, m, d] = day.split('-').map(Number);
    return localDay(new Date(y, m - 1, d + days));
};
