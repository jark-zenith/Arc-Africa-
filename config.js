window.ARC_CONFIG = {
  supabaseUrl: "https://zlhvczgjzgmiugdjfmgj.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsaHZjemdqemdtaXVnZGpmbWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyODc2MjYsImV4cCI6MjEwOTg2MzYyNn0.n6ZAmDCRUTgG9gb7-oGOKZJZl8NDTcm5kmLTZV8dB4s",
  googleOAuthConfigured: false
};
document.addEventListener('DOMContentLoaded', () => {
  const tools = document.createElement('script');
  tools.type = 'module';
  tools.src = 'owner-tools.js';
  document.head.appendChild(tools);
});