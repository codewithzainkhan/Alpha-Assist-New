export type AuthStackParamList = {
  Intro: undefined;
  LoginOptions: undefined;
  Login: undefined;
  Signup: undefined;
  OTP: {
    email: string;
    userData: {
      name: string;
      phone: string;
    };
  };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
  Dashboard: undefined;
};

export type MainStackParamList = {
  Dashboard: undefined;
  Analytics: { initialTab?: "Tasks" | "Goals" } | undefined;
  Personalization: undefined;
  Profile: undefined;
  // initialMessage lets Dashboard prompt chips pre-fill the chat input
  AIChat: { initialMessage?: string } | undefined;
  VoiceCloning: undefined;
  ChatEnhancement: undefined;
  AppAppearance: undefined;
  PersonalInformation: undefined;
  Subscription: undefined;
  MyAccount: undefined;
  ChangePassword: undefined;
  Report: { period: "daily" | "weekly" | "monthly" };
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
