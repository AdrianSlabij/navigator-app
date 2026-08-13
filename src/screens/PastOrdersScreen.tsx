import React, { useEffect, useState, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, FlatList, RefreshControl } from 'react-native';
import { Spinner, Text, XStack, YStack, Separator, useTheme } from 'tamagui';
import BackButton from '../components/BackButton';
import PastOrderListItem from '../components/PastOrderListItem';
import { useOrderManager } from '../contexts/OrderManagerContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from '../utils/toast';

const PastOrdersScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { t } = useLanguage();
    const { pastOrders, isFetchingPastOrders, hasMorePastOrders, reloadPastOrders, loadMorePastOrders } = useOrderManager();
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        (async () => {
            setIsLoading(true);
            try {
                await reloadPastOrders();
            } catch (err) {
                console.warn('[PastOrdersScreen] Failed to load past orders:', err);
                toast.error('Unable to load past orders. Please try again.');
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    const handleRefresh = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await reloadPastOrders();
        } catch (err) {
            console.warn('[PastOrdersScreen] Failed to refresh past orders:', err);
            toast.error('Unable to refresh past orders. Please try again.');
        } finally {
            setIsRefreshing(false);
        }
    }, [reloadPastOrders]);

    const handleOrderPress = useCallback(
        (order) => {
            // PastOrdersScreen lives in the DriverAccountTab stack, while Order/OrderModal
            // live in the sibling DriverTaskTab stack, so we must navigate across tabs.
            navigation.navigate('DriverTaskTab', {
                screen: 'OrderModal',
                params: { order: order.serialize() },
            });
        },
        [navigation]
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.val }}>
            <YStack flex={1} px='$4' pt='$3'>
                <XStack alignItems='center' gap='$3' mb='$4'>
                    <BackButton onPress={() => navigation.goBack()} />
                    <Text color='$textPrimary' fontSize='$8' fontWeight='bold'>
                        {t('AccountScreen.pastOrders')}
                    </Text>
                </XStack>
                {isLoading ? (
                    <YStack flex={1} alignItems='center' justifyContent='center'>
                        <Spinner size='large' color='$textPrimary' />
                    </YStack>
                ) : !pastOrders.length ? (
                    <YStack flex={1} alignItems='center' justifyContent='center'>
                        <Text color='$textSecondary'>No past orders yet.</Text>
                    </YStack>
                ) : (
                    <FlatList
                        data={pastOrders}
                        keyExtractor={(order) => order.id.toString()}
                        renderItem={({ item: order }) => <PastOrderListItem order={order} onPress={() => handleOrderPress(order)} />}
                        ItemSeparatorComponent={() => <YStack height='$2' />}
                        showsVerticalScrollIndicator={false}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.textPrimary.val} />}
                        onEndReachedThreshold={0.5}
                        onEndReached={() => loadMorePastOrders()}
                        ListFooterComponent={
                            isFetchingPastOrders && !isRefreshing && !isLoading ? (
                                <YStack py='$4' alignItems='center'>
                                    <Spinner color='$textPrimary' />
                                </YStack>
                            ) : null
                        }
                    />
                )}
            </YStack>
        </SafeAreaView>
    );
};

export default PastOrdersScreen;
