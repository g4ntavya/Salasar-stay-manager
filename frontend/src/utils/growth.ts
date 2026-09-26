export interface GrowthResult {
    value: number;
    label: string;
    isInfinityCase: boolean;
    isNegative: boolean;
}

export const computeGrowth = (current: number, previous: number): GrowthResult => {
    if (previous === 0) {
        return {
            value: current > 0 ? 100 : 0,
            label: previous === 0 && current > 0 ? '∞' : '0%',
            isInfinityCase: previous === 0 && current > 0,
            isNegative: false,
        };
    }

    const diff = current - previous;
    const growth = (diff / Math.abs(previous)) * 100;

    return {
        value: growth,
        label: `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`,
        isInfinityCase: false,
        isNegative: growth < 0,
    };
};
