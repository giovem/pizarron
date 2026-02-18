/**
 * Configuración de Supabase para tiempo real (usuarios conectados + sync tarjetas).
 * 
 * 1. Copia este archivo:  config.supabase.example.js  →  config.supabase.js
 * 2. En config.supabase.js rellena url y anonKey con los de tu proyecto (Supabase → Project Settings → API).
 * 3. config.supabase.js NO se sube a GitHub (está en .gitignore).
 */
(function() {
  'use strict';
  window.PIZARRON_SUPABASE = {
    url: 'https://TU_PROYECTO.supabase.co',
    anonKey: 'TU_ANON_KEY_LEGACY_AQUI'
  };
})();
