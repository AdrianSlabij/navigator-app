import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';

type QrCodeScannerProps = {
    onScan: (data: string) => void;
    width?: number | string;
    height?: number | string;
    overlayStyle?: object;
    scanCooldown?: number; // ms before allowing next scan
    manualCapture?: boolean;
};

export const QrCodeScanner: React.FC<QrCodeScannerProps> = ({ onScan, width = '100%', height = '100%', overlayStyle = {}, scanCooldown = 3000, manualCapture = false }) => {
    const device = useCameraDevice('back');
    const [isScanning, setIsScanning] = useState(true);
    const [isArmed, setIsArmed] = useState(!manualCapture);
    const cooldownRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        (async () => {
            const status = await Camera.requestCameraPermission();
            if (status !== 'authorized') {
                console.warn('Camera permission not granted');
            }
        })();

        return () => {
            if (cooldownRef.current) {
                clearTimeout(cooldownRef.current);
            }
        };
    }, []);

    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned: (codes) => {
            if (!isScanning || codes.length === 0) return;
            if (manualCapture && !isArmed) return;

            const scanned = codes[0];
            setIsScanning(false);
            if (manualCapture) setIsArmed(false);

            if (typeof onScan === 'function') {
                onScan(scanned, codes);
            }

            cooldownRef.current = setTimeout(() => {
                setIsScanning(true);
            }, scanCooldown);
        },
    });

    if (!device) {
        return (
            <View style={[styles.noCamera, { width, height }]}>
                <Text style={{ color: '#fff' }}>No camera available</Text>
            </View>
        );
    }

    return (
        <View style={{ width, height }}>
            <Camera style={StyleSheet.absoluteFill} device={device} isActive={true} codeScanner={codeScanner} />
            <View pointerEvents='none' style={styles.overlayContainer}>
                <View style={[styles.overlayBox, overlayStyle]} />
            </View>
            {manualCapture && (
                <View style={styles.captureButtonContainer} pointerEvents='box-none'>
                    <Pressable style={[styles.captureButton, isArmed && styles.captureButtonArmed]} disabled={isArmed} onPress={() => setIsArmed(true)}>
                        <Text style={styles.captureButtonText}>{isArmed ? 'Aim at code…' : 'Scan'}</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    noCamera: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlayBox: {
        width: 150,
        height: 150,
        borderWidth: 3,
        borderStyle: 'dashed',
        borderColor: 'red',
        opacity: 0.75,
    },
    captureButtonContainer: {
        position: 'absolute',
        bottom: 32,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    captureButton: {
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 999,
        backgroundColor: '#fff',
    },
    captureButtonArmed: {
        backgroundColor: 'rgba(255,255,255,0.5)',
    },
    captureButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#000',
    },
});

export default QrCodeScanner;
