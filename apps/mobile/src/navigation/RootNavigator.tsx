import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreen } from '../screens/DashboardScreen';
import { OrderBookScreen } from '../screens/OrderBookScreen';
import { PartiesScreen } from '../screens/PartiesScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { InwardScreen } from '../screens/InwardScreen';
import { OutwardScreen } from '../screens/OutwardScreen';
import { PaymentsScreen } from '../screens/PaymentsScreen';
import { ItemsScreen } from '../screens/ItemsScreen';
import { LiveStockScreen } from '../screens/LiveStockScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { ApprovalsScreen } from '../screens/ApprovalsScreen';
import { AuditLogScreen } from '../screens/AuditLogScreen';
import { WhatsappScreen } from '../screens/WhatsappScreen';
import { AccountScreen } from '../screens/AccountScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const headerStyle = { headerStyle: { backgroundColor: '#134e4a' }, headerTintColor: '#fff' } as const;

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ ...headerStyle }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Order Book" component={OrderBookScreen} />
      <Tab.Screen name="Parties" component={PartiesScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={headerStyle}>
        <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Inward" component={InwardScreen} />
        <Stack.Screen name="Outward" component={OutwardScreen} />
        <Stack.Screen name="Payments" component={PaymentsScreen} options={{ title: 'Payment Due' }} />
        <Stack.Screen name="Items" component={ItemsScreen} />
        <Stack.Screen name="LiveStock" component={LiveStockScreen} options={{ title: 'Live Stock & Rate' }} />
        <Stack.Screen name="Users" component={UsersScreen} />
        <Stack.Screen name="Approvals" component={ApprovalsScreen} />
        <Stack.Screen name="AuditLog" component={AuditLogScreen} options={{ title: 'Audit Log' }} />
        <Stack.Screen name="Whatsapp" component={WhatsappScreen} options={{ title: 'WhatsApp Messages' }} />
        <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'My Account' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
