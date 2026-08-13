import React, { useMemo } from 'react';
import { Pressable } from 'react-native';
import { YStack, XStack, Text, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faBox, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import { format as formatDate } from 'date-fns';
import { formatCurrency } from '../utils/format';
import useAppTheme from '../hooks/use-app-theme';
import Badge from './Badge';

// Prefer the dropoff (where the order was delivered), falling back to the
// last waypoint or pickup for orders that don't use a dedicated dropoff.
function getDestinationAddress(order) {
    const dropoff = order.getAttribute('payload.dropoff');
    const pickup = order.getAttribute('payload.pickup');
    const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
    const destination = dropoff ?? waypoints[waypoints.length - 1] ?? pickup;

    return destination?.address ?? null;
}

export const PastOrderListItem = ({ order, onPress }) => {
    const theme = useTheme();
    const { isDarkMode } = useAppTheme();
    const createdAt = order.getAttribute('created_at');
    const total = order.getAttribute('meta.total');
    const currency = order.getAttribute('meta.currency');
    const destinationAddress = useMemo(() => getDestinationAddress(order), [order]);

    return (
        <Pressable onPress={onPress}>
            <YStack bg='$background' borderRadius='$4' borderWidth={1} borderColor={isDarkMode ? '$borderColor' : '$borderColorWithShadow'} px='$3' py='$3' gap='$2'>
                <XStack alignItems='center' justifyContent='space-between' gap='$3'>
                    <XStack flex={1} alignItems='center' gap='$2'>
                        <XStack borderRadius='$4' width={32} height={32} bg={isDarkMode ? '$info' : '$blue-600'} alignItems='center' justifyContent='center'>
                            <FontAwesomeIcon icon={faBox} color={isDarkMode ? theme.textPrimary.val : theme.surface.val} size={14} />
                        </XStack>
                        <YStack flex={1}>
                            <Text color='$textPrimary' fontSize={15} fontWeight='bold' numberOfLines={1}>
                                {order.getAttribute('tracking_number.tracking_number') ?? order.id}
                            </Text>
                            <Text color='$textSecondary' fontSize={12}>
                                {createdAt ? formatDate(new Date(createdAt), 'PP HH:mm') : 'N/A'}
                            </Text>
                        </YStack>
                    </XStack>
                    <YStack alignItems='flex-end' gap='$1'>
                        <Text color='$textPrimary' fontSize={14} fontWeight='bold'>
                            {formatCurrency(total ?? 0, currency)}
                        </Text>
                        <Badge status={order.getAttribute('status')} />
                    </YStack>
                </XStack>
                {destinationAddress && (
                    <XStack alignItems='center' gap='$2' pl='$1'>
                        <FontAwesomeIcon icon={faLocationDot} color={theme.textSecondary.val} size={12} />
                        <Text flex={1} color='$textSecondary' fontSize={12} numberOfLines={1}>
                            {destinationAddress}
                        </Text>
                    </XStack>
                )}
            </YStack>
        </Pressable>
    );
};

export default PastOrderListItem;
