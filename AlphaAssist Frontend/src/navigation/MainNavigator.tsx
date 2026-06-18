import { createStackNavigator } from "@react-navigation/stack"
import BottomTabs from "../components/common/BottomNavigation"
import AIChatScreen from "../screens/main/Dashboard/AiChatScreen"
import PersonalizationScreen from "../screens/main/PersonalizationScreen"
import VoiceCloningScreen from "../screens/main/VoiceCloningScreen"
import ChatEnhancementScreen from "../screens/main/ChatEnhancementScreen"
import AppAppearanceScreen from "../screens/main/Profile/Sub-Screens/AppAppearanceScreen"
import PersonalInformationScreen from "../screens/main/Profile/Sub-Screens/PersonalInformationScreen"
import SubscriptionScreen from "../screens/main/Profile/Sub-Screens/SubscriptionScreen"
import MyAccountScreen from "../screens/main/Profile/Sub-Screens/MyAccountScreen"
import ChangePasswordScreen from "../screens/auth/Password/ChangePasswordScreen"
import type { MainStackParamList } from "../types/navigation"
import ReportScreen from "../screens/main/ReportScreen"

const Stack = createStackNavigator<MainStackParamList>()

export const MainNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={BottomTabs} />
      <Stack.Screen name="AIChat" component={AIChatScreen} />
      <Stack.Screen name="Profile" component={BottomTabs} />
      <Stack.Screen name="Personalization" component={PersonalizationScreen} />
      <Stack.Screen name="VoiceCloning" component={VoiceCloningScreen} />
      <Stack.Screen name="ChatEnhancement" component={ChatEnhancementScreen} />
      <Stack.Screen name="AppAppearance" component={AppAppearanceScreen} />
      <Stack.Screen name="PersonalInformation" component={PersonalInformationScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="MyAccount" component={MyAccountScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="Report" component={ReportScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  )
}