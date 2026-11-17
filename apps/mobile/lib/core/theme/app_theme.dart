import 'package:flutter/material.dart';

/// Thèmes Material 3 — charte dynamique par tenant injectée via
/// ColorScheme.fromSeed (docs/03 §3.1.4).
class AppTheme {
  static ThemeData get light => _base(Brightness.light);
  static ThemeData get dark => _base(Brightness.dark);

  static ThemeData _base(Brightness brightness) {
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF0F766E), // brand Tablya par défaut
      brightness: brightness,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      visualDensity: VisualDensity.adaptivePlatformDensity,
    );
  }
}
