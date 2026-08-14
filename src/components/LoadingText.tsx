import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Text, XStack } from 'tamagui';

type LoadingTextProps = {
    text?: string | null;
};

type BouncingDotProps = {
    progress: Animated.AnimatedValue;
    phase: number; // phase offset between 0 and 1
};

const BouncingDot: React.FC<BouncingDotProps> = ({ progress, phase }) => {
    const bounceHeight = -8;
    const offsetProgress = Animated.modulo(Animated.add(progress, phase), 1);

    // Interpolate so that as offsetProgress goes from 0 -> 0.5 -> 1,
    // the dot moves from 0 to bounceHeight and back to 0.
    const translateY = offsetProgress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, bounceHeight, 0],
    });

    return (
        <Animated.View style={{ transform: [{ translateY }] }}>
            <Text fontSize={20}>.</Text>
        </Animated.View>
    );
};

const LoadingText: React.FC<LoadingTextProps> = ({ text, ...props }) => {
    const progress = useRef(new Animated.Value(0)).current;
    const isLoading = text === null || text === undefined;

    // Only animate while actually in the loading state
    useEffect(() => {
        if (!isLoading) return;

        let isActive = true;
        const animate = () => {
            if (!isActive) return;
            progress.setValue(0);
            Animated.timing(progress, {
                toValue: 1,
                duration: 1000, // duration for one full cycle (in ms)
                easing: Easing.linear,
                useNativeDriver: true,
            }).start(() => {
                if (isActive) animate();
            });
        };
        animate();

        return () => {
            isActive = false;
            progress.stopAnimation();
        };
    }, [isLoading, progress]);

    if (!isLoading) {
        return <Text {...props}>{text}</Text>;
    }

    return (
        <XStack alignItems='center'>
            <BouncingDot progress={progress} phase={0.66} />
            <BouncingDot progress={progress} phase={0.33} />
            <BouncingDot progress={progress} phase={0} />
        </XStack>
    );
};

export default LoadingText;
