import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { EventRegister } from 'react-native-event-listeners';
import LoadingOverlay from '../components/LoadingOverlay';
import { useChat } from '../contexts/ChatContext';
import { useNotification } from '../contexts/NotificationContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import useFleetbase from '../hooks/use-fleetbase';
import { later } from '../utils';

// How long to show the tab-switch spinner for. Bounded/fixed rather than tied to the
// destination screen's own "ready" signal, so it can never get stuck showing forever.
const TAB_SWITCH_SPINNER_MS = 450;

const getCurrentScreen = (tabNavigation) => {
    const tabState = tabNavigation.getState?.();
    const currentTabRoute = tabState?.routes?.[tabState.index];
    const stackState = currentTabRoute?.state;
    const currentScreen = stackState?.routes?.[stackState.index];

    return {
        tabName: currentTabRoute?.name,
        screenName: currentScreen?.name,
        screenParams: currentScreen?.params,
    };
};

const DriverLayout = ({ children, descriptors, navigation: tabNavigation }) => {
    const navigation = useNavigation();
    const { fleetbase } = useFleetbase();
    const { getChannel } = useChat();
    const { addNotificationListener, removeNotificationListener } = useNotification();
    const { reloadActiveOrders } = useOrderManager();
    const [isTabSwitching, setIsTabSwitching] = useState(false);
    const hideTimeoutRef = useRef(null);

    // Show the spinner the instant a tab bar button is pressed
    useEffect(() => {
        const listener = EventRegister.addEventListener('tab.switch.pressed', () => {
            setIsTabSwitching(true);
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
            hideTimeoutRef.current = setTimeout(() => {
                setIsTabSwitching(false);
                hideTimeoutRef.current = null;
            }, TAB_SWITCH_SPINNER_MS);
        });

        return () => {
            EventRegister.removeEventListener(listener);
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!fleetbase) {
            return;
        }

        const handlePushNotification = async (notification, action) => {
            console.log('[Notification]', notification);
            console.log('[Notification #action]', action);
            const { payload } = notification;
            const id = payload.id;
            const type = payload.type;

            if (type === 'chat_message_received' && action === 'opened') {
                try {
                    const chatChannelId = payload.channel;
                    const channel = await getChannel(chatChannelId);
                    const { tabName, screenName, screenParams } = getCurrentScreen(tabNavigation);

                    const isOnDriverChatTab = tabName === 'DriverChatTab';
                    const isOnSameChatChannel = screenName === 'ChatChannel' && screenParams?.channel?.uuid === chatChannelId;

                    if (!isOnDriverChatTab) {
                        tabNavigation.navigate('DriverChatTab', { screen: 'ChatList' });
                    }

                    if (!isOnSameChatChannel) {
                        later(() => {
                            tabNavigation.navigate('DriverChatTab', {
                                screen: 'ChatChannel',
                                params: { channel },
                            });
                        }, 100);
                    } else {
                        console.log('[Navigation] Chat channel already open for this message.');
                    }
                } catch (err) {
                    console.warn('Error trying to open chat channel:', err);
                }
            }

            if (typeof id === 'string' && id.startsWith('order_')) {
                // Reload active orders
                reloadActiveOrders();

                try {
                    const order = await fleetbase.orders.findRecord(id);
                    const orderId = order.id;
                    const { tabName, screenName, screenParams } = getCurrentScreen(tabNavigation);

                    const isOnDriverTaskTab = tabName === 'DriverTaskTab';
                    const isOrderModalOpen = screenName === 'OrderModal' && screenParams?.order?.id === orderId;

                    if (!isOnDriverTaskTab) {
                        tabNavigation.navigate('DriverTaskTab', { screen: 'DriverOrderManagement' });
                    }

                    if (!isOrderModalOpen) {
                        later(() => {
                            tabNavigation.navigate('DriverTaskTab', {
                                screen: 'OrderModal',
                                params: { order: order.serialize() },
                            });
                        }, 100);
                    } else {
                        console.log('[Navigation] Order modal already open for this order.');
                    }
                } catch (err) {
                    console.warn('Error navigating to order:', err);
                }
            }
        };

        addNotificationListener(handlePushNotification);

        return () => {
            removeNotificationListener(handlePushNotification);
        };
    }, [addNotificationListener, removeNotificationListener, fleetbase, tabNavigation, navigation]);

    return (
        <View style={{ width: '100%', height: '100%', flex: 1 }}>
            {children}
            <LoadingOverlay visible={isTabSwitching} />
        </View>
    );
};

export default DriverLayout;
