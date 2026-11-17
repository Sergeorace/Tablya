import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import 'scan_screen.dart';
import 'menu_screen.dart';
import 'commandes_screen.dart';
import 'otp_login_screen.dart';
import '../staff/login_screen.dart';

/// Shell espace client : scan QR → menu → panier → paiement → suivi.
class ClientShell extends StatefulWidget {
  const ClientShell({super.key});

  @override
  State<ClientShell> createState() => _ClientShellState();
}

class _ClientShellState extends State<ClientShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [
          ScanScreen(),
          MenuScreen(),
          CommandesScreen(),
          ProfileScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.qr_code_scanner), label: 'Scan'),
          NavigationDestination(icon: Icon(Icons.restaurant_menu), label: 'Menu'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'Commandes'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Profil'),
        ],
      ),
    );
  }
}

/// Écran profil client : statut connexion + accès espace personnel.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profil')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.badge),
            title: const Text('Espace client'),
            subtitle: const Text('Connecté par OTP téléphone'),
          ),
          ListTile(
            leading: const Icon(Icons.point_of_sale),
            title: const Text('Espace personnel'),
            subtitle: const Text('KDS, caisse, pointage — compte staff'),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const StaffLoginScreen()),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('Se déconnecter'),
            onTap: () async {
              await ApiClient.instance.logout();
              if (!context.mounted) return;
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const OtpLoginScreen()),
                (_) => false,
              );
            },
          ),
        ],
      ),
    );
  }
}
