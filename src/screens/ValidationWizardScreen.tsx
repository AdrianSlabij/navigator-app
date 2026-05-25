import { Order, Place } from '@fleetbase/sdk';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, TextInput } from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';
import { Button, Image, Spinner, Text, XStack, YStack, useTheme } from 'tamagui';
import LoadingOverlay from '../components/LoadingOverlay';
import QrCodeScanner from '../components/QrCodeScanner';
import { useTempStore } from '../contexts/TempStoreContext';
import useFleetbase from '../hooks/use-fleetbase';
import { toast } from '../utils/toast';

const PRESIGN_API_URL = `https://6bfckbk6zktuydxhc5gc3amauq0sneet.lambda-url.us-east-1.on.aws/`;
// TODO: Replace this with actual backend endpoint when you have it
const BEESURE_BACKEND_URL = `https://your-future-backend-url.com/api/report`;

const ValidationWizardScreen = ({ route }) => {
    const { activity, order: orderData } = route.params;
    const { adapter } = useFleetbase();
    const navigation = useNavigation();
    const theme = useTheme();

    const order = new Order(orderData, adapter);
    const { store, setValue } = useTempStore();

    // Safely default to empty values if they don't exist in the store yet
    const photos = store.validationPhotos || [];
    const notes = store.validationNotes || '';
    const resultScore = store.resultScore || '';
    const confidenceScore = store.confidenceScore || '';
    const likenessScore = store.likenessScore || '';
    const vibeCheckScore = store.vibeCheckScore || '';
    const subjectExists = store.subjectExists ?? true;

    // Wizard States
    const [step, setStep] = useState(0); // 0 = QR Handshake, 1 = Photos, 2 = Scores, 3 = Notes
    const [isLoading, setIsLoading] = useState(false); // Used for UI loading overlays
    const [isScanning, setIsScanning] = useState(true); // Prevents rapid-fire scans
    const [isSubmitting, setIsSubmitting] = useState(false); // Used for final submission

    // New State for Decoupled Handshake
    const [scannedQrValue, setScannedQrValue] = useState(null);
    const [qrSubject, setQrSubject] = useState(null);

    // Clear tempstore if the user navigates to a different order
    useEffect(() => {
        if (store.validationOrderId !== orderData.id) {
            setValue('validationPhotos', []);
            setValue('validationNotes', '');
            setValue('resultScore', '');
            setValue('confidenceScore', '');
            setValue('likenessScore', '');
            setValue('vibeCheckScore', '');
            setValue('subjectExists', true);
            setValue('validationOrderId', orderData.id);
        }
    }, [orderData.id]);

    // Handle QR Code Scan - SERVER SIDE VALIDATION
    const handleQrCodeScan = async (data) => {
        if (!isScanning) return;
        setIsScanning(false);

        const scannedValue = data?.value || data?.data || data;
        console.log('📸 SCANNER FIRED! Scanned:', scannedValue);

        let subject;

        try {
            // Ultra-Safe Subject Resolution
            const waypointData = route.params?.waypoint || activity?.waypoint;
            const entity = route.params?.entity;

            const isWaypointActivity = waypointData && typeof waypointData.tracking === 'string' && waypointData.tracking.trim() !== '';

            if (isWaypointActivity) {
                subject = new Place(waypointData, adapter);
            } else if (entity) {
                subject = entity;
            } else {
                subject = order;
            }
        } catch (err) {
            console.log('❌ FATAL EXTRACTION CRASH:', err);
            setIsScanning(true);
            return;
        }

        // Hit Fleetbase API to validate the QR code immediately
        setIsLoading(true); // Turn on the verifying overlay
        try {
            console.log(`Sending Handshake to Fleetbase API...`);
            const proof = await order.captureQrCode(subject, {
                code: scannedValue,
                waypoint: activity?.waypoint_uuid || route.params?.waypoint?.id,
            });

            if (proof && proof.id) {
                console.log('✅ SUCCESS: Handshake accepted, Proof ID:', proof.id);
                toast.success('Handshake verified!');

                // Save the Proof ID to your temp store so we can attach it at the end
                setValue('fleetbaseProofId', proof.id);
                setStep(1); // Move to photos
            } else {
                throw new Error('No proof returned.');
            }
        } catch (error) {
            console.log('❌ HANDSHAKE REJECTED:', error);
            Alert.alert('Invalid Handshake', 'Fleetbase rejected this QR code. Are you sure this is the right item?', [{ text: 'Try Again', onPress: () => setIsScanning(true) }]);
        } finally {
            setIsLoading(false);
        }
    };

    // Helper to ensure scores stay between 0 and 100
    const handleScoreChange = (key, text) => {
        const numericValue = text.replace(/[^0-9]/g, '');
        if (numericValue === '') {
            setValue(key, '');
            return;
        }
        const val = parseInt(numericValue, 10);
        if (val >= 0 && val <= 100) {
            setValue(key, val.toString());
        }
    };

    // Opens the native camera, crops the image, and saves the local path
    const handleTakePhoto = async () => {
        try {
            const image = await ImagePicker.openCamera({
                width: 1024,
                height: 1024,
                cropping: true,
                mediaType: 'photo',
                compressImageQuality: 0.8,
            });

            setValue('validationPhotos', [...photos, image.path]);
        } catch (error) {
            if (error.message !== 'User cancelled image selection') {
                console.warn('Camera Error:', error);
                Alert.alert('Error', 'Failed to open camera.');
            }
        }
    };

    // Atomic Submission: S3 Uploads -> Fleetbase Activity Completion
    const runValidationSubmission = async () => {
        setIsSubmitting(true);
        const s3Keys = [];

        try {
            // 1. Request Pre-signed URLs from Beesure Backend
            const presignRes = await fetch(PRESIGN_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count: photos.length }),
            });

            if (!presignRes.ok) throw new Error('Failed to fetch pre-signed URLs.');
            const { presignedData } = await presignRes.json();

            // 2. Upload images directly to S3
            for (let i = 0; i < photos.length; i++) {
                const localUri = photos[i];
                const { uploadUrl, key } = presignedData[i];
                const imgBlob = await (await fetch(localUri)).blob();

                const s3Res = await fetch(uploadUrl, {
                    method: 'PUT',
                    body: imgBlob,
                    headers: { 'Content-Type': imgBlob.type || 'image/jpeg' },
                });

                if (!s3Res.ok) throw new Error(`S3 Upload failed for image ${i}`);
                s3Keys.push(key);
            }

            // 3. (Beesure Backend Call goes here when ready)
            // Send the validation data to your backend for processing and storage
            //beesure backend url?

            // 4. Call Fleetbase to complete the order activity status using the Proof ID from Step 0
            const fleetbasePayload = {
                activity: {
                    ...activity,
                    status: 'completed',
                    code: 'completed',
                },
                proof: store.fleetbaseProofId, // Retrieve from your temp store
                attributes: {
                    validation_notes: notes,
                    validation_s3_keys: s3Keys,
                },
            };

            await order.updateActivity(fleetbasePayload);

            toast.success('Validation Submitted Successfully!');

            // Clear the temp store
            setValue('validationPhotos', []);
            setValue('validationNotes', '');
            setValue('resultScore', '');
            setValue('confidenceScore', '');
            setValue('likenessScore', '');
            setValue('vibeCheckScore', '');
            setValue('subjectExists', true);
            setValue('fleetbaseProofId', null);
            setValue('validationOrderId', null);

            navigation.goBack();
        } catch (error) {
            console.error('Submission Flow Error:', error);
            Alert.alert('Submission Failed', error.message || 'An unexpected error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <YStack flex={1} bg='$background' safeArea>
            <LoadingOverlay visible={isLoading} text='Verifying Handshake...' />

            {/* --- STEP 0: QR HANDSHAKE --- */}
            {step === 0 && (
                <YStack flex={1} padding='$4'>
                    <YStack mb='$4'>
                        <Text fontSize={24} fontWeight='bold'>
                            QR Handshake
                        </Text>
                        <Text fontSize={16} color='$textPrimary' mt='$2'>
                            Scan the customer's QR code to verify the order and begin validation.
                        </Text>
                    </YStack>

                    <YStack flex={1} overflow='hidden' borderRadius='$4'>
                        {isScanning && <QrCodeScanner onScan={handleQrCodeScan} />}
                    </YStack>

                    {/* DEV BYPASS: Remove before pushing to production */}
                    {__DEV__ && (
                        <Button mt='$4' bg='$warning' onPress={() => setStep(1)}>
                            [DEV] Skip Handshake
                        </Button>
                    )}
                </YStack>
            )}

            {/* --- STEPS 1-3: VALIDATION WIZARD --- */}
            {step > 0 && (
                <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 40, padding: 16 }}>
                    <Text fontSize={24} fontWeight='bold' mb='$4'>
                        Validation Step {step} of 3
                    </Text>

                    {step === 1 && (
                        <YStack space='$4' flex={1}>
                            <Text fontSize={16} color='$textPrimary'>
                                Take photos of the items or subject to validate condition.
                            </Text>

                            <Button onPress={handleTakePhoto} bg='$info' color='white' pressStyle={{ opacity: 0.8 }}>
                                Take Photo
                            </Button>

                            <XStack flexWrap='wrap' gap='$2' mt='$2'>
                                {photos.map((uri, idx) => (
                                    <YStack key={idx} width={100} height={100} bg='$gray3' borderRadius='$2' overflow='hidden'>
                                        <Image source={{ uri }} width={100} height={100} />
                                    </YStack>
                                ))}
                            </XStack>

                            <YStack flex={1} justifyContent='flex-end'>
                                <Button bg='$success' color='white' disabled={photos.length === 0} opacity={photos.length === 0 ? 0.5 : 1} onPress={() => setStep(2)}>
                                    Continue to Scores
                                </Button>
                            </YStack>
                        </YStack>
                    )}

                    {step === 2 && (
                        <YStack space='$4' flex={1}>
                            <Text fontSize={16} color='$textPrimary'>
                                Enter Validation Scores (0-100)
                            </Text>

                            {['resultScore', 'confidenceScore', 'likenessScore', 'vibeCheckScore'].map((scoreKey) => {
                                const labels = {
                                    resultScore: 'Result Score',
                                    confidenceScore: 'Confidence Score',
                                    likenessScore: 'Likeness Score',
                                    vibeCheckScore: 'Vibe Check Score',
                                };
                                const values = {
                                    resultScore,
                                    confidenceScore,
                                    likenessScore,
                                    vibeCheckScore,
                                };

                                return (
                                    <YStack key={scoreKey} space='$2'>
                                        <Text color='$textPrimary'>{labels[scoreKey]}</Text>
                                        <TextInput
                                            style={{
                                                height: 50,
                                                borderColor: theme.gray8?.val || '#ccc',
                                                borderWidth: 1,
                                                borderRadius: 8,
                                                padding: 12,
                                                color: theme.textPrimary?.val || 'black',
                                                backgroundColor: theme.background?.val,
                                            }}
                                            keyboardType='numeric'
                                            placeholder='0 - 100'
                                            placeholderTextColor='#999'
                                            value={values[scoreKey]}
                                            onChangeText={(text) => handleScoreChange(scoreKey, text)}
                                        />
                                    </YStack>
                                );
                            })}

                            <YStack space='$2' mt='$2'>
                                <Text color='$textPrimary'>Subject Exists?</Text>
                                <XStack space='$4'>
                                    <Button flex={1} bg={subjectExists ? '$info' : '$gray5'} color={subjectExists ? 'white' : '$textPrimary'} onPress={() => setValue('subjectExists', true)}>
                                        Yes
                                    </Button>
                                    <Button
                                        flex={1}
                                        bg={!subjectExists ? '$info' : '$gray5'}
                                        color={!subjectExists ? 'white' : '$textPrimary'}
                                        onPress={() => setValue('subjectExists', false)}
                                    >
                                        No
                                    </Button>
                                </XStack>
                            </YStack>

                            <YStack flex={1} justifyContent='flex-end' space='$3' mt='$4'>
                                <Button onPress={() => setStep(1)} bg='$gray5' color='$textPrimary'>
                                    Back to Photos
                                </Button>
                                <Button bg='$success' color='white' onPress={() => setStep(3)}>
                                    Continue to Notes
                                </Button>
                            </YStack>
                        </YStack>
                    )}

                    {step === 3 && (
                        <YStack space='$4' flex={1}>
                            <Text fontSize={16} color='$textPrimary'>
                                Additional Validation Notes
                            </Text>

                            <TextInput
                                style={{
                                    height: 150,
                                    borderColor: theme.gray8?.val || '#ccc',
                                    borderWidth: 1,
                                    borderRadius: 8,
                                    padding: 12,
                                    textAlignVertical: 'top',
                                    color: theme.textPrimary?.val || 'black',
                                    backgroundColor: theme.background?.val,
                                }}
                                multiline
                                placeholder='Enter notes here...'
                                placeholderTextColor='#999'
                                value={notes}
                                onChangeText={(text) => setValue('validationNotes', text)}
                            />

                            <YStack flex={1} justifyContent='flex-end' space='$3'>
                                <Button onPress={() => setStep(2)} bg='$gray5' color='$textPrimary'>
                                    Back to Scores
                                </Button>

                                <Button bg='$success' onPress={runValidationSubmission} disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        <Spinner color='white' />
                                    ) : (
                                        <Text color='white' fontWeight='600'>
                                            Complete & Finish Order
                                        </Text>
                                    )}
                                </Button>
                            </YStack>
                        </YStack>
                    )}
                </ScrollView>
            )}
        </YStack>
    );
};

export default ValidationWizardScreen;
