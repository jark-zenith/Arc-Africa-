window.ARC_CONFIG = {
  supabaseUrl: "https://fgtkttnhhhvgonrwhakj.supabase.co",
  supabaseAnonKey: "sb_publishable_0XZbcky5jrbI7mZ-p3Ljsw_-VwrHPct",
  googleOAuthConfigured: false
};
document.addEventListener('DOMContentLoaded', () => {
  const tools = document.createElement('script');
  tools.type = 'module';
  tools.src = 'owner-tools.js';
  document.head.appendChild(tools);
  const adminRouter = document.createElement('script');
  adminRouter.type = 'module';
  adminRouter.src = 'admin-router.js';
  document.head.appendChild(adminRouter);
});
