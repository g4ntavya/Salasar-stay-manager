/**
 * Cross-platform CSV Export Utility
 * Uses Android SAF (Storage Access Framework) for reliable export on Android APKs
 */

import { Platform, Alert } from "react-native";
// Use legacy API since writeAsStringAsync is deprecated in expo-file-system v19+
// See: https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

// Cast to any to avoid TypeScript issues with expo-file-system exports
const FS = FileSystem as any;

export interface ExportCsvOptions {
    filename: string;     // e.g. "Bookings_Jan_2026.csv"
    csv: string;          // the csv text content
}

/**
 * Export CSV to device - works on APK, web, and iOS
 * - Android: Uses SAF to let user pick folder (Downloads, etc.)
 * - Web: Browser download
 * - iOS: Temp file + share sheet
 */
export async function exportCsvToDevice(opts: ExportCsvOptions): Promise<boolean> {
    const filename = opts.filename.endsWith(".csv")
        ? opts.filename
        : `${opts.filename}.csv`;

    // Add BOM for Excel compatibility
    const BOM = '\uFEFF';
    const csvContent = opts.csv.startsWith(BOM) ? opts.csv : BOM + opts.csv;

    try {
        // ✅ WEB: browser download (works 100% on web)
        if (Platform.OS === "web") {
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            Alert.alert("Download Started", `${filename} is being downloaded.`);
            return true;
        }

        // ✅ ANDROID: SAF save to a user-chosen folder (Downloads etc.) — MOST RELIABLE
        if (Platform.OS === "android") {
            console.log('[CSV Export] Android detected, using SAF');

            const perm = await FS.StorageAccessFramework.requestDirectoryPermissionsAsync();

            if (!perm.granted) {
                Alert.alert("Export Cancelled", "Please select a folder to save the CSV.");
                return false;
            }

            console.log('[CSV Export] Permission granted, creating file...');

            // Create a CSV file in the selected folder
            const fileUri = await FS.StorageAccessFramework.createFileAsync(
                perm.directoryUri,
                filename,
                "text/csv"
            );

            console.log('[CSV Export] File created at:', fileUri);

            // Write CSV content to that URI
            await FS.writeAsStringAsync(fileUri, csvContent, {
                encoding: FS.EncodingType?.UTF8 || 'utf8',
            });

            console.log('[CSV Export] File written successfully');

            Alert.alert("Saved ✅", `CSV saved successfully.\n\nFile: ${filename}`);
            return true;
        }

        // ✅ iOS: write temp file + share (iOS doesn't expose a public Downloads folder)
        const tmpUri = `${FS.cacheDirectory}${filename}`;
        await FS.writeAsStringAsync(tmpUri, csvContent, {
            encoding: FS.EncodingType?.UTF8 || 'utf8',
        });

        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(tmpUri, {
                mimeType: "text/csv",
                dialogTitle: "Export CSV",
                UTI: "public.comma-separated-values-text",
            });
            return true;
        } else {
            Alert.alert("Export Failed", "Sharing is not available on this device.");
            return false;
        }
    } catch (error: any) {
        console.error('[CSV Export] Error:', error);
        Alert.alert(
            "Export Failed",
            `An error occurred: ${error?.message || 'Unknown error'}`
        );
        return false;
    }
}

// Backward compatibility alias
export const exportCsv = async (
    csvContent: string,
    fileNameWithoutExtension: string,
    _options?: any
): Promise<{ success: boolean; message: string }> => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${fileNameWithoutExtension}_${timestamp}.csv`;

    const success = await exportCsvToDevice({ filename, csv: csvContent });
    return {
        success,
        message: success ? 'Export successful' : 'Export failed'
    };
};