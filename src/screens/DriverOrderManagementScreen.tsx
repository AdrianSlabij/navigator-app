import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { endOfYear, format, startOfYear, subDays } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, Platform, RefreshControl } from 'react-native';
import CalendarStrip from 'react-native-calendar-strip';
import { Separator, Text, XStack, YStack, useTheme } from 'tamagui';
import AdhocOrderCard from '../components/AdhocOrderCard';
import OrderCard from '../components/OrderCard';
import PastOrderCard from '../components/PastOrderCard';
import Spacer from '../components/Spacer';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useOrderManager } from '../contexts/OrderManagerContext';
import useAppTheme from '../hooks/use-app-theme';
import useSocketClusterClient from '../hooks/use-socket-cluster-client';
import { formatDuration, formatMeters } from '../utils/format';

const isAndroid = Platform.OS === 'android';

const countStops = (orders = []) =>
    orders.reduce((total, order) => {
        const { pickup, dropoff, waypoints = [] } = order.getAttribute('payload') || {};
        const stops = [pickup, dropoff, ...waypoints].filter(Boolean);
        return total + stops.length;
    }, 0);

const sumDuration = (orders = []) =>
    orders.reduce((total, order) => {
        return total + order.getAttribute('time');
    }, 0);

const sumDistance = (orders = []) =>
    orders.reduce((total, order) => {
        return total + order.getAttribute('distance');
    }, 0);

// Helper function to filter out duplicate beesure validations, prioritizing accepted orders
const filterUniqueValidations = (orders) => {
    const orderMap = new Map();

    orders.forEach((order) => {
        const validationId = order.getAttribute('meta.validation_id') || order.getAttribute('custom_fields.validation_id');

        // If it's a standard order without a validation ID, use its own ID as the key so it never gets filtered
        const key = validationId ? `val_${validationId}` : `ord_${order.id}`;

        if (!orderMap.has(key)) {
            // First time seeing this validation ID, add it to the map
            orderMap.set(key, order);
        } else {
            // A duplicate exists, must prioritize the one the driver actually accepted.
            const existingOrder = orderMap.get(key);

            // Check if the orders are assigned to a driver
            const isExistingAssigned = existingOrder.getAttribute('driver_assigned') !== null;
            const isNewAssigned = order.getAttribute('driver_assigned') !== null;

            // If the new order in the loop is assigned (e.g., 'started'), but the
            // one we already saved is just unassigned/adhoc, OVERWRITE it.
            if (!isExistingAssigned && isNewAssigned) {
                orderMap.set(key, order);
            }
        }
    });

    // Convert the map values back into a flat array for the FlatList
    return Array.from(orderMap.values());
};

const REFRESH_NEARBY_ORDERS_MS = 6000 * 5; // 5 mins
const REFRESH_ORDERS_MS = 6000 * 15; // 15 mins

const DriverOrderManagementScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const calendar = useRef();
    const listenerRef = useRef();
    const { isDarkMode } = useAppTheme();
    const { driver } = useAuth();
    const {
        allActiveOrders,
        currentOrders,
        setCurrentDate,
        currentDate,
        reloadCurrentOrders,
        reloadActiveOrders,
        isFetchingCurrentOrders,
        activeOrderMarkedDates,
        nearbyOrders,
        isFetchingNearbyOrders,
        reloadNearbyOrders,
        dismissedOrders,
        setDimissedOrders,
    } = useOrderManager();
    const { listen } = useSocketClusterClient();
    const { addNotificationListener, removeNotificationListener } = useNotification();
    const startingDate = subDays(new Date(currentDate), 2);
    const datesWhitelist = [new Date(), { start: startOfYear(new Date()), end: endOfYear(new Date()) }];
    const todayString = format(new Date(currentDate), 'EEEE');
    const activeCurrentOrders = currentOrders.filter((order) => !['completed', 'created', 'canceled'].includes(order.getAttribute('status')));
    const stops = countStops(activeCurrentOrders);
    const distance = sumDistance(activeCurrentOrders);
    const duration = sumDuration(activeCurrentOrders);

    // Memoized filtered array so we only calculate when orders change
    const displayOrders = useMemo(() => {
        const combinedOrders = [...nearbyOrders, ...currentOrders];
        return filterUniqueValidations(combinedOrders);
    }, [nearbyOrders, currentOrders]);

    useEffect(() => {
        const handlePushNotification = async (notification, action) => {
            const { payload } = notification;
            const id = payload.id;
            const type = payload.type;

            // If any order related push notification comes just reload current orders
            if (typeof id === 'string' && id.startsWith('order_')) {
                reloadCurrentOrders();
            }
        };

        addNotificationListener(handlePushNotification);

        return () => {
            removeNotificationListener(handlePushNotification);
        };
    }, [addNotificationListener, removeNotificationListener]);

    useFocusEffect(
        useCallback(() => {
            const handleReloadNearbyOrders = () => {
                reloadNearbyOrders({}, { setLoadingFlag: false });
            };

            const interval = setInterval(handleReloadNearbyOrders, REFRESH_NEARBY_ORDERS_MS);
            return () => clearInterval(interval);
        }, [])
    );

    useFocusEffect(
        useCallback(() => {
            const handleReloadCurrentOrders = () => {
                reloadCurrentOrders({}, { setLoadingFlag: false });
            };
            reloadActiveOrders();
            handleReloadCurrentOrders();

            const interval = setInterval(handleReloadCurrentOrders, REFRESH_ORDERS_MS);
            return () => clearInterval(interval);
        }, [currentDate])
    );

    useFocusEffect(
        useCallback(() => {
            const listenForOrderUpdates = async () => {
                const listener = await listen(`driver.${driver.id}`, ({ event }) => {
                    if (typeof event === 'string' && event === 'order.ready') {
                        reloadCurrentOrders();
                    }
                    if (typeof event === 'string' && event === 'order.ping') {
                        reloadNearbyOrders();
                    }
                });
                if (listener) {
                    listenerRef.current = listener;
                }
            };

            listenForOrderUpdates();

            return () => {
                if (listenerRef.current) {
                    listenerRef.current.stop();
                }
            };
        }, [listen, driver.id])
    );

    const handleAdhocDismissal = useCallback(
        (order) => {
            setDimissedOrders((prevDismissedOrders) => [...prevDismissedOrders, order.id]);
        },
        [setDimissedOrders]
    );

    const handleAdhocAccept = useCallback(() => {
        reloadNearbyOrders();
        reloadCurrentOrders();
    }, [reloadNearbyOrders, reloadCurrentOrders]);

    const renderOrder = ({ item: order }) => {
        const isAdhocOrder = order.getAttribute('adhoc') === true && order.getAttribute('driver_assigned') === null;
        if (isAdhocOrder) {
            if (dismissedOrders.includes(order.id)) return;
            return (
                <YStack px='$2' py='$4'>
                    <AdhocOrderCard
                        order={order}
                        onPress={() => navigation.navigate('OrderModal', { order: order.serialize() })}
                        onDismiss={handleAdhocDismissal}
                        onAccept={handleAdhocAccept}
                    />
                </YStack>
            );
        }

        return (
            <YStack px='$2' py='$4'>
                <OrderCard order={order} onPress={() => navigation.navigate('Order', { order: order.serialize() })} />
            </YStack>
        );
    };

    const ActiveOrders = () => {
        if (!allActiveOrders.length) return;

        return (
            <YStack>
                <YStack px='$1'>
                    <Text color='$textPrimary' fontSize={18} fontWeight='bold'>
                        Active Orders: {allActiveOrders.length}
                    </Text>
                </YStack>
                <YStack>
                    <FlatList
                        data={allActiveOrders}
                        keyExtractor={(order) => order.id.toString()}
                        renderItem={({ item: order }) => (
                            <YStack py='$3'>
                                <PastOrderCard order={order} onPress={() => navigation.navigate('Order', { order: order.serialize() })} />
                            </YStack>
                        )}
                        showsVerticalScrollIndicator={false}
                        showsHorizontalScrollIndicator={false}
                        ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                    />
                </YStack>
            </YStack>
        );
    };

    const NoOrders = () => {
        return (
            <YStack py='$5' px='$3' space='$6' flex={1} height='100%'>
                <YStack alignItems='center'>
                    <XStack alignItems='center' bg='$info' borderWidth={1} borderColor='$infoBorder' space='$2' px='$3' py='$2' borderRadius='$5' width='100%' flexWrap='wrap'>
                        <FontAwesomeIcon icon={faInfoCircle} color={theme['$infoText'].val} />
                        <Text color='$infoText' fontSize={16}>
                            No current orders for {format(new Date(currentDate), 'yyyy-MM-dd')}
                        </Text>
                    </XStack>
                </YStack>
                <ActiveOrders />
            </YStack>
        );
    };

    return (
        <YStack flex={1} bg='$surface'>
            <YStack
                bg='$background'
                pb='$2'
                elevation={10}
                style={{
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.4,
                    shadowRadius: 12,
                }}
                borderBottomWidth={1}
                borderColor={isDarkMode ? 'transparent' : '$borderColorWithShadow'}
            >
                <CalendarStrip
                    scrollable
                    ref={calendar}
                    datesWhitelist={datesWhitelist}
                    style={{ height: 100, paddingTop: 10, paddingBottom: 15 }}
                    calendarColor={'transparent'}
                    calendarHeaderStyle={{ color: isDarkMode ? theme['$gray-300'].val : theme['$gray-600'].val, fontSize: 14 }}
                    calendarHeaderContainerStyle={{ marginBottom: 20 }}
                    dateNumberStyle={{ color: theme['$gray-500'].val, fontSize: 12 }}
                    dateNameStyle={{ color: theme['$gray-500'].val, fontSize: 12 }}
                    dayContainerStyle={{ padding: 0, height: isAndroid ? 55 : 60 }}
                    highlightDateNameStyle={{ color: theme['$gray-100'].val, fontSize: 12 }}
                    highlightDateNumberStyle={{ color: theme['$gray-100'].val, fontSize: 12 }}
                    highlightDateContainerStyle={{ backgroundColor: theme['$blue-500'].val, borderRadius: 6 }}
                    iconContainer={{ flex: 0.1 }}
                    numDaysInWeek={5}
                    markedDates={activeOrderMarkedDates}
                    startingDate={startingDate}
                    selectedDate={new Date(currentDate)}
                    onDateSelected={(selectedDate) => setCurrentDate(format(new Date(selectedDate), 'yyyy-MM-dd HH:mm:ssXXX'))}
                    iconLeft={require('../../assets/nv-arrow-left.png')}
                    iconRight={require('../../assets/nv-arrow-right.png')}
                />
            </YStack>
            <YStack bg='$surface' px='$3' py='$4' borderBottomWidth={1} borderTopWidth={0} borderColor={isDarkMode ? '$borderColor' : '$borderColorWithShadow'}>
                <Text color='$textPrimary' fontSize='$8' fontWeight='bold' mb='$1'>
                    {todayString} orders
                </Text>
                <XStack space='$2' alignItems='center'>
                    <Text color='$textSecondary' fontSize='$5'>
                        {currentOrders.length} {currentOrders.length > 1 ? 'orders' : 'order'}
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        •
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        {stops} {stops > 1 ? 'stops' : 'stop'} left
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        •
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        {formatDuration(duration)}
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        •
                    </Text>
                    <Text color='$textSecondary' fontSize='$5'>
                        {formatMeters(distance)}
                    </Text>
                </XStack>
            </YStack>
            <FlatList
                // uses the filtered array instead of the raw data
                data={displayOrders}
                keyExtractor={(order, index) => order.id.toString() + '_' + index}
                renderItem={renderOrder}
                refreshControl={<RefreshControl refreshing={isFetchingCurrentOrders} onRefresh={reloadCurrentOrders} tintColor={theme['$blue-500'].val} />}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                ListFooterComponent={<Spacer height={200} />}
                ListEmptyComponent={<NoOrders />}
            />
        </YStack>
    );
};

export default DriverOrderManagementScreen;
