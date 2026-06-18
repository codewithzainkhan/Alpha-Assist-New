import { createStackNavigator } from "@react-navigation/stack"
import type { AuthStackParamList } from "../types/navigation"

// Import your auth screens here (we'll create these next)
import SplashScreen from "../screens/auth/Intro/SplashScreen"
import IntroScreen from "../screens/auth/Intro/IntroScreen"
import LoginOptionsScreen from "../screens/auth/Login/LoginOptionsScreen"
import LoginScreen from "../screens/auth/Login/LoginScreen"
import SignupScreen from "../screens/auth/Signup/SignupScreen"
import OTPScreen from "../screens/auth/Password/OTPScreen"
import DashboardScreen from "../screens/main/Dashboard/DashboardScreen"
import ResetPasswordScreen from "../screens/auth/Password/ResetPasswordScreen"
import ForgotPasswordScreen from "../screens/auth/Password/ForgotPasswordScreen"

const Stack = createStackNavigator<AuthStackParamList>()

export const AuthNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="LoginOptions"
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Uncomment as you create each screen */}
      {/* <Stack.Screen name="Splash" component={SplashScreen} /> */}
      <Stack.Screen name="Intro" component={IntroScreen} />
      <Stack.Screen name="LoginOptions" component={LoginOptionsScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} /> 
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} />
    </Stack.Navigator>
  )
}
