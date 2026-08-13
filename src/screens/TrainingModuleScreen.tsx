import React, { useEffect, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Image, SafeAreaView, ScrollView, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { Button, Spinner, Text, XStack, YStack, useTheme } from 'tamagui';
import BackButton from '../components/BackButton';
import { useTraining } from '../contexts/TrainingContext';
import { toast } from '../utils/toast';

// Source screenshots are 540x1110 (see assets/images/training).
const GUIDE_IMAGE_ASPECT_RATIO = 540 / 1110;
const SCREEN_PADDING = 16; // matches the px='$4' on the YStack below

const TrainingModuleScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const route = useRoute();
    const reviewMode = route.params?.reviewMode ?? false;
    const { modules, loadModules } = useTraining();
    const [isLoading, setIsLoading] = useState(true);
    const [step, setStep] = useState(0);
    const { width: windowWidth } = useWindowDimensions();
    const guideImageWidth = windowWidth - SCREEN_PADDING * 2;

    useEffect(() => {
        (async () => {
            setIsLoading(true);
            try {
                await loadModules();
            } catch (err) {
                console.warn('[TrainingModuleScreen] Failed to load training modules:', err);
                toast.error('Unable to load training content. Please try again.');
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    if (isLoading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val, alignItems: 'center', justifyContent: 'center' }}>
                <Spinner size='large' color='$textPrimary' />
            </SafeAreaView>
        );
    }

    if (!modules.length) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val, alignItems: 'center', justifyContent: 'center' }}>
                <Text color='$textPrimary'>No training content is available right now.</Text>
            </SafeAreaView>
        );
    }

    const module = modules[step];
    const isLastModule = step === modules.length - 1;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
            <YStack flex={1} px='$4' pt='$3'>
                <XStack alignItems='center' justifyContent='space-between' mb='$3'>
                    {reviewMode ? <BackButton onPress={() => navigation.goBack()} /> : <YStack />}
                    <Text color='$textSecondary' fontSize='$3'>
                        Module {step + 1} of {modules.length}
                    </Text>
                </XStack>
                <ScrollView showsVerticalScrollIndicator={false}>
                    <Text color='$textPrimary' fontSize='$8' fontWeight='bold' mb='$3'>
                        {module.title}
                    </Text>
                    {!!module.videoUrl && (
                        <YStack height={220} borderRadius='$4' overflow='hidden' mb='$4' bg='$secondary'>
                            <WebView
                                source={{ uri: module.videoUrl }}
                                allowsInlineMediaPlayback
                                mediaPlaybackRequiresUserAction={false}
                                style={{ flex: 1 }}
                            />
                        </YStack>
                    )}
                    {!!module.textContent && (
                        <Text color='$textSecondary' fontSize='$5' lineHeight={24} mb='$6'>
                            {module.textContent}
                        </Text>
                    )}
                    {!!module.intro && (
                        <Text color='$textSecondary' fontSize='$5' lineHeight={24} mb='$5'>
                            {module.intro}
                        </Text>
                    )}
                    {Array.isArray(module.sections) &&
                        module.sections.map((section, i) => (
                            <YStack key={i} mb='$6'>
                                {!!section.heading && (
                                    <Text color='$textPrimary' fontSize='$6' fontWeight='bold' mb='$2'>
                                        {section.heading}
                                    </Text>
                                )}
                                <Text color='$textSecondary' fontSize='$5' lineHeight={24} mb='$3'>
                                    {section.body}
                                </Text>
                                {!!section.image && (
                                    <Image
                                        source={section.image}
                                        resizeMode='contain'
                                        style={{
                                            width: guideImageWidth,
                                            height: guideImageWidth / GUIDE_IMAGE_ASPECT_RATIO,
                                            borderRadius: 12,
                                        }}
                                    />
                                )}
                            </YStack>
                        ))}
                </ScrollView>
                <XStack space='$3' pb='$4'>
                    {step > 0 && (
                        <Button flex={1} size='$5' onPress={() => setStep((s) => s - 1)} rounded>
                            <Button.Text>Back</Button.Text>
                        </Button>
                    )}
                    <Button
                        flex={1}
                        size='$5'
                        bg='$primary'
                        rounded
                        onPress={() => {
                            if (isLastModule) {
                                navigation.navigate('TrainingQuiz', { reviewMode });
                            } else {
                                setStep((s) => s + 1);
                            }
                        }}
                    >
                        <Button.Text color='$white' fontWeight='bold'>
                            {isLastModule ? 'Take Quiz' : 'Next'}
                        </Button.Text>
                    </Button>
                </XStack>
            </YStack>
        </SafeAreaView>
    );
};

export default TrainingModuleScreen;
