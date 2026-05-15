import { Order } from '@fleetbase/sdk';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, ScrollView, TextInput } from 'react-native';
import ImagePicker from 'react-native-image-crop-picker';
import { Button, Image, Spinner, Text, XStack, YStack, useTheme } from 'tamagui';

import useFleetbase from '../hooks/use-fleetbase';
import { toast } from '../utils/toast';

//const BEESURE_API_BASE = 'https://api.your-beesure-backend.com';
const PRESIGN_API_URL = `https://6bfckbk6zktuydxhc5gc3amauq0sneet.lambda-url.us-east-1.on.aws/`;

const ValidationWizardScreen = ({ route }) => {
    const { activity, order: orderData } = route.params;
    const { adapter } = useFleetbase();
    const navigation = useNavigation();
    const theme = useTheme();

    const order = new Order(orderData, adapter);

    const [step, setStep] = useState(1);
    const [photos, setPhotos] = useState([]);
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    //Opens the native camera, crops the image, and saves the local path
    const handleTakePhoto = async () => {
        try {
            const image = await ImagePicker.openCamera({
                width: 1024,
                height: 1024,
                cropping: true,
                mediaType: 'photo',
                compressImageQuality: 0.8,
            });

            setPhotos((prev) => [...prev, image.path]);
        } catch (error) {
            if (error.message !== 'User cancelled image selection') {
                console.warn('Camera Error:', error);
                Alert.alert('Error', 'Failed to open camera.');
            }
        }
    };

    // Get Presigned S3 URLs, Upload Blobs to S3, Post Keys to Beesure, Complete via Fleetbase
    const runValidationSubmission = async () => {
        setIsSubmitting(true);
        const s3Keys = [];

        try {
            //Request Pre-signed URLs from Beesure Backend
            const presignRes = await fetch(PRESIGN_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count: photos.length }),
            });

            if (!presignRes.ok) throw new Error('Failed to fetch pre-signed URLs.');

            const { presignedData } = await presignRes.json();
            // Expected: [{ uploadUrl: string, key: string }, ...]

            //Upload images directly to S3
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

            // Post the bundle to Beesure Backend
            const beesurePayload = {
                order_id: orderData.id,
                activity_id: activity.id,
                notes: notes,
                image_keys: s3Keys,
            };

            const beesureRes = await fetch(`${PRESIGN_API_URL}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(beesurePayload),
            });

            if (!beesureRes.ok) throw new Error('Beesure backend failed to process validation.');

            //Call Fleetbase to complete the order activity status
            const fleetbasePayload = {
                activity: {
                    ...activity,
                    status: 'completed',
                    code: 'completed',
                },
                attributes: {
                    validation_notes: notes,
                    validation_s3_keys: s3Keys,
                },
            };

            await order.updateActivity(fleetbasePayload);

            toast.success('Validation Submitted Successfully!');
            navigation.goBack();
        } catch (error) {
            console.error('Submission Flow Error:', error);

            // TODO: Implementation for offline persistence (AsyncStorage)
            // should be triggered here if error.message indicates a network failure.

            Alert.alert('Submission Failed', error.message || 'An unexpected error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <YStack flex={1} bg='$background' padding='$4' safeArea>
            <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}>
                <Text fontSize={24} fontWeight='bold' mb='$4'>
                    Validation Step {step} of 2
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
                                Continue to Notes
                            </Button>
                        </YStack>
                    </YStack>
                )}

                {step === 2 && (
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
                            onChangeText={setNotes}
                        />

                        <YStack flex={1} justifyContent='flex-end' space='$3'>
                            <Button onPress={() => setStep(1)} bg='$gray5' color='$textPrimary'>
                                Back to Photos
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
        </YStack>
    );
};

export default ValidationWizardScreen;
