window.ARC_CONFIG = {
  supabaseUrl: "https://zlhvczgjzgmiugdjfmgj.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJ6bGh2Y3pnanpnbWl1Z2RqZm1naiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzk0Mjg3NjI2LCJleHAiOjIxMDk4NjM2MjZ9.fake",
  googleOAuthConfigured: false
};
document.addEventListener('DOMContentLoaded', () => {
  const tools = document.createElement('script');
  tools.type = 'module';
  tools.src = 'owner-tools.js';
  document.head.appendChild(tools);
});