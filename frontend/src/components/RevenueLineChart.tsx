import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

interface RevenueLineChartProps {
    labels: string[];
    data: number[];
    currencySymbol?: string;
}

const RevenueLineChart: React.FC<RevenueLineChartProps> = ({ labels, data, currencySymbol = '₹' }) => {
    const chartConfig = {
        elevation: 0,
        backgroundColor: '#fff',
        backgroundGradientFrom: '#fff',
        backgroundGradientTo: '#fff',
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
        style: {
            borderRadius: 16,
        },
        propsForDots: {
            r: '4',
            strokeWidth: '2',
            stroke: '#3b82f6',
        },
        propsForBackgroundLines: {
            strokeDasharray: '', // solid background lines
            stroke: '#f3f4f6',
        },
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Revenue Trend</Text>
            <LineChart
                data={{
                    labels: labels,
                    datasets: [
                        {
                            data: data,
                        },
                    ],
                }}
                width={Dimensions.get('window').width - 32}
                height={220}
                yAxisLabel={currencySymbol}
                chartConfig={chartConfig}
                bezier
                style={styles.chart}
                fromZero
                verticalLabelRotation={30}
                formatYLabel={(val) => {
                    const num = parseInt(val, 10);
                    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
                    return num.toString();
                }}
                withInnerLines={true}
                withOuterLines={false}
                withShadow={false}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 16,
    },
    chart: {
        marginVertical: 8,
        borderRadius: 16,
        paddingRight: 40, // Avoid cutting off last label
    },
});

export default RevenueLineChart;
