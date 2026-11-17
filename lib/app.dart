import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/api/api_client.dart';
import 'core/theme/app_theme.dart';
import 'features/client/client_shell.dart';
import 'features/client/otp_login_screen.dart';
import 'features/staff/staff_shell.dart';

/// Routeur d'accueil : staff connecté → StaffShell ; sinon client (login OTP
/// si aucun token, ClientShell si token client déjà présent).
class _HomeResolver extends StatelessWidget {
  const _HomeResolver();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: () async {
        final logged = await ApiClient.instance.isLoggedIn;
        if (!logged) return null;
        return ApiClient.instance.role;
      }(),
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        final role = snap.data;
        if (role == null) return const OtpLoginScreen();
        if (role == 'staff') return const StaffShell();
        return const ClientShell();
      },
    );
  }
}

class TablyaApp extends ConsumerWidget {
  const TablyaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'Tablya',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      home: const _HomeResolver(),
    );
  }
}
