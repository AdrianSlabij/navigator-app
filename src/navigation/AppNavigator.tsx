import { createStaticNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Boot, LocationPermission, InstanceLink } from './stacks/CoreStack';
import AuthStack from './stacks/AuthStack';
import DriverNavigator from './DriverNavigator';
import { useIsNotAuthenticated, useIsAuthenticated } from '../contexts/AuthContext';
import { useNeedsTraining, useIsAuthenticatedAndTrained } from '../contexts/TrainingContext';
import TrainingModuleScreen from '../screens/TrainingModuleScreen';
import TrainingQuizScreen from '../screens/TrainingQuizScreen';
import AppLayout from '../layouts/AppLayout';

// Mandatory onboarding gate: mounted only while an authenticated driver hasn't
// passed training yet (see useNeedsTraining). gestureEnabled/back are disabled
// so it can't be swiped or backed out of.
const TrainingGateStack = createNativeStackNavigator({
    initialRouteName: 'TrainingModule',
    screenOptions: {
        headerShown: false,
        gestureEnabled: false,
    },
    screens: {
        TrainingModule: { screen: TrainingModuleScreen },
        TrainingQuiz: { screen: TrainingQuizScreen },
    },
});

const RootStack = createNativeStackNavigator({
    initialRouteName: 'Boot',
    layout: AppLayout,
    screens: {
        Boot,
        LocationPermission,
        InstanceLink,
        ...AuthStack,
        TrainingGate: {
            if: useNeedsTraining,
            screen: TrainingGateStack,
            options: { headerShown: false, gestureEnabled: false, animation: 'none' },
        },
        DriverNavigator: {
            if: useIsAuthenticatedAndTrained,
            screen: DriverNavigator,
            options: { headerShown: false, gestureEnabled: false, animation: 'none' },
        },
    },
});

const AppNavigator = createStaticNavigation(RootStack);
export default AppNavigator;
