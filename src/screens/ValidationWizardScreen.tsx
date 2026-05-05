//todo: handle data synch between fleetbase and beesure backend (ex. payload received by beesure but failed being sent to Fleetbase, etc.)
//todo: handle wifi connectivity issues...maybe we can save the validation payload in local storage and have a background process that checks for unsent payloads and tries to resend them when connectivity is back?
import { Order } from '@fleetbase/sdk';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, ScrollView, TextInput } from 'react-native';
import { Button, Image, Spinner, Text, XStack, YStack, useTheme } from 'tamagui';
import useFleetbase from '../hooks/use-fleetbase';
import { toast } from '../utils/toast';
// import ImagePicker from 'react-native-image-crop-picker';

const ValidationWizardScreen = ({ route }) => {
    const { activity, order: orderData, waypoint: waypointData } = route.params;
    const { adapter } = useFleetbase();
    const navigation = useNavigation();
    const theme = useTheme();

    // Reconstruct Fleetbase instances
    const order = new Order(orderData, adapter);

    // Form State
    const [step, setStep] = useState(1);
    const [photos, setPhotos] = useState([]);
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleTakePhoto = async () => {
        try {
            //to do: take photo (of id/subject/etc..)
            // Example using react-native-image-crop-picker
            /*
            const image = await ImagePicker.openCamera({
                width: 1024,
                height: 1024,
                cropping: true,
                includeBase64: true
            });
            setPhotos([...photos, `data:${image.mime};base64,${image.data}`]);
            */

            // Mocked photo for demonstration:
            Alert.alert('Camera', 'Camera opens here. Save photo to state.');
            setPhotos([...photos, 'mock_image_uri_or_base64']);
        } catch (error) {
            console.warn('Error taking photo:', error);
        }
    };

    //todo: add a function that bundles the besure validation payload and stores into beesure (using presigned s3 urls for images and save into db...probably need to call a custom backend endpoint to handle this)

    //submit results to fleetbase, update activity to completed, and navigate back to order screen
    const submitOrderToFleetbase = async () => {
        setIsSubmitting(true);
        try {
            // need to upload the photos to your backend first and get file IDs back
            // const fileIds = await uploadPhotosToServer(photos);

            //  updating the activity to 'completed'
            // Create the custom FLEETBASE payload with the form data
            const payload = {
                activity: {
                    ...activity,
                    status: 'completed',
                    code: 'completed', // Force it to complete
                },
                attributes: {
                    validation_notes: notes,
                    validation_photos: photos, // Or fileIds
                },
            };

            // Send payload to Fleetbase
            await order.updateActivity(payload);

            toast.success('Validation complete!');

            // Navigate back to the Order screen, order is now complete
            navigation.goBack();
        } catch (error) {
            console.error('Validation submission failed', error);
            Alert.alert('Error', 'Failed to submit validation. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <YStack flex={1} bg='$background' padding='$4' safeArea>
            <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}>
                <Text fontSize={24} fontWeight='bold' mb='$4'>
                    Validation Process - Step {step} of 2
                </Text>

                {step === 1 && (
                    <YStack space='$4' flex={1}>
                        <Text fontSize={16} color='$textPrimary'>
                            Please take photos of the items to validate their condition.
                        </Text>

                        <Button onPress={handleTakePhoto} bg='$info' color='$white'>
                            Open Camera
                        </Button>

                        {/* Display captured photos */}
                        <XStack flexWrap='wrap' gap='$2'>
                            {photos.map((uri, idx) => (
                                <YStack key={idx} width={100} height={100} bg='$gray3' borderRadius='$2' overflow='hidden'>
                                    <Image source={{ uri }} width={100} height={100} />
                                </YStack>
                            ))}
                        </XStack>

                        <YStack flex={1} justifyContent='flex-end'>
                            <Button bg='$success' color='$white' disabled={photos.length === 0} opacity={photos.length === 0 ? 0.5 : 1} onPress={() => setStep(2)}>
                                Next Step
                            </Button>
                        </YStack>
                    </YStack>
                )}

                {/* todo: make this isntead of notes a propper validation workflow */}

                {step === 2 && (
                    <YStack space='$4' flex={1}>
                        <Text fontSize={16} color='$textPrimary'>
                            Fill out the validation form notes below.
                        </Text>

                        <TextInput
                            style={{
                                height: 150,
                                borderColor: 'gray',
                                borderWidth: 1,
                                borderRadius: 8,
                                padding: 12,
                                textAlignVertical: 'top',
                                color: theme.textPrimary?.val || 'black',
                            }}
                            multiline
                            placeholder='Enter validation notes...'
                            placeholderTextColor='#999'
                            value={notes}
                            onChangeText={setNotes}
                        />

                        <YStack flex={1} justifyContent='flex-end' space='$3'>
                            <Button onPress={() => setStep(1)} bg='$gray5'>
                                Back
                            </Button>

                            <Button bg='$success' onPress={submitOrderToFleetbase} disabled={isSubmitting}>
                                {isSubmitting ? <Spinner color='white' /> : <Text color='white'>Complete Validation</Text>}
                            </Button>
                        </YStack>
                    </YStack>
                )}
            </ScrollView>
        </YStack>
    );
};

export default ValidationWizardScreen;
