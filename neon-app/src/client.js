import { createClient } from '@neondatabase/neon-js';

// Keep the existing classroom UI's auth contract while using Neon's native auth.
const cfg = window.KLASEPH_CONFIG || {};
if (cfg.NEON_AUTH_URL && cfg.NEON_DATA_API_URL) {
  const client = createClient({auth:{url:cfg.NEON_AUTH_URL},dataApi:{url:cfg.NEON_DATA_API_URL}});
  const native = client.auth;
  const listeners = new Set();
  let pendingProfile = null;
  let pendingEmail = null;
  const result = (user, session, error = null) => ({data:{user,session:session ? {...session,user} : null},error});
  async function safe(action) {
    try {
      const response=await action();
      if(response?.error)window.KLASEPH_MONITOR?.capture('auth',response.error);
      return response;
    } catch (error) {
      window.KLASEPH_MONITOR?.capture('auth',error);
      return {data:{user:null,session:null},error:{message:error.message || 'Unable to connect. Please try again.'}};
    }
  }
  const auth = {
    getSession: () => safe(async () => {
      const {data,error} = await native.getSession();
      if (error || !data?.session || !data?.user?.emailVerified) return result(data?.user,data?.session,error);
      const claim = await client.rpc('claim_existing_profile');
      if (claim.error) return result(null,null,claim.error);
      const user = {...data.user,auth_id:data.user.id,id:claim.data || data.user.id};
      return result(user, data.session, null);
    }),
    getUser: () => safe(async () => {
      const {data,error} = await native.getSession();
      return {data:{user:data?.user},error};
    }),
    signInWithPassword: ({email,password}) => safe(async () => {
      if (email.toLowerCase() !== pendingEmail) pendingProfile = null;
      const response = await native.signIn.email({email,password});
      if (response.error) return result(null,null,response.error);
      if (response.data?.user && !response.data.user.emailVerified) return result(null,null,{code:'EMAIL_NOT_VERIFIED',message:'Verify your email to continue.'});
      return auth.getSession();
    }),
    signUp: ({email,password,options}) => safe(async () => {
      pendingProfile = options?.data || {};
      pendingEmail = email.toLowerCase();
      const response = await native.signUp.email({email,password,name:pendingProfile.full_name || email.split('@')[0]});
      if (response.error) { pendingProfile = null; return result(null,null,response.error); }
      if (response.data?.user && !response.data.user.emailVerified) return result(response.data.user,null);
      const sessionResult = await auth.getSession();
      if (!sessionResult.data.session) return result(response.data?.user,null);
      return sessionResult;
    }),
    signOut: () => safe(async () => {
      const response = await native.signOut();
      pendingProfile = null;
      pendingEmail = null;
      for (const fn of listeners) fn('SIGNED_OUT',null);
      return response;
    }),
    resetPasswordForEmail: (email,{redirectTo}) => safe(() => native.requestPasswordReset({email,redirectTo})),
    updateUser: ({password}) => safe(async () => {
      const token = new URLSearchParams(location.search).get('token');
      if (!token) return {error:{message:'Open the password reset link from your email first.'}};
      return native.resetPassword({newPassword:password,token});
    }),
    onAuthStateChange: (fn) => {
      listeners.add(fn);
      return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}};
    }
  };
  window.KLASEPH_NEON = {
    auth,
    from: (...args) => client.from(...args),
    rpc: (...args) => client.rpc(...args),
    verifyEmail: (email,otp) => safe(() => native.emailOtp.verifyEmail({email,otp})),
    resendVerification: (email) => safe(() => native.emailOtp.sendVerificationOtp({email,type:'email-verification'})),
    pendingProfile: () => pendingProfile,
    clearPendingProfile: () => { pendingProfile = null; }
  };
}
