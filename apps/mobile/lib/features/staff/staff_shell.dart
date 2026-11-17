import 'package:flutter/material.dart';

/// Espace personnel — plan de salle, prise de commande, caisse.
/// Mode sombre par défaut, cibles tactiles ≥48dp (docs/03 §3.1.3).
/// Implémentation en E3.
class StaffShell extends StatelessWidget {
  const StaffShell({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Espace personnel')),
      body: const Center(child: Text('Plan de salle — E3')),
    );
  }
}
