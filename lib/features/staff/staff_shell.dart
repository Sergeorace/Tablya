import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import 'caisse_screen.dart';
import 'kds_screen.dart';
import 'pointage_screen.dart';
import 'staff_order_screen.dart';
import 'login_screen.dart';

/// Shell espace personnel : KDS production, pointage, déconnexion.
/// Mode sombre par défaut, cibles tactiles ≥48dp (docs/03 §3.1.3).
class StaffShell extends StatefulWidget {
  const StaffShell({super.key});

  @override
  State<StaffShell> createState() => _StaffShellState();
}

class _StaffShellState extends State<StaffShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [StaffOrderScreen(), KdsScreen(), CaisseScreen(), PointageScreen()],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.point_of_sale), label: 'Commande'),
          NavigationDestination(icon: Icon(Icons.soup_kitchen), label: 'Cuisine'),
          NavigationDestination(icon: Icon(Icons.payments), label: 'Caisse'),
          NavigationDestination(icon: Icon(Icons.fingerprint), label: 'Pointage'),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: ListView(
            children: [
              const ListTile(title: Text('Espace personnel'), subtitle: Text('Tablya')),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Déconnexion'),
                onTap: () async {
                  await ApiClient.instance.logout();
                  if (!context.mounted) return;
                  Navigator.of(context).pushAndRemoveUntil(
                    MaterialPageRoute(builder: (_) => const StaffLoginScreen()),
                    (_) => false,
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
