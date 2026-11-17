import 'package:flutter/material.dart';

/// Menu public de l'établissement (B3) — placeholder E5.
/// Catégories en chips sticky + cartes produits + panier flottant.
class MenuScreen extends StatelessWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Menu')),
      body: const Center(
        child: Text('Menu — connexion à l\'établissement via scan QR (E5)'),
      ),
    );
  }
}
