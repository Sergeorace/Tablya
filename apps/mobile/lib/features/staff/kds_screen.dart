import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';

/// KDS — file de production temps réel (GET /kds, rafraîchi toutes les 10 s).
/// Colonnes par poste cible : cuisine / bar / caisse.
class KdsScreen extends StatefulWidget {
  const KdsScreen({super.key});

  @override
  State<KdsScreen> createState() => _KdsScreenState();
}

class _KdsScreenState extends State<KdsScreen> {
  List<dynamic> _commandes = [];
  bool _loading = true;
  String? _error;
  Timer? _timer;
  String _poste = 'cuisine';

  static const _postes = ['cuisine', 'bar', 'caisse'];

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.dio.get('/kds', queryParameters: {'poste': _poste});
      if (!mounted) return;
      setState(() {
        _commandes = res.data as List;
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; _error = 'API injoignable'; });
    }
  }

  Future<void> _avancer(String commandeId) async {
    try {
      await ApiClient.instance.dio.patch('/commandes/$commandeId/statut',
          data: {'statut': 'en_preparation'});
      _load();
    } catch (_) {/* statut déjà avancé */}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cuisine — KDS'),
        actions: [
          DropdownButton<String>(
            value: _poste,
            underline: const SizedBox(),
            items: _postes
                .map((p) => DropdownMenuItem(value: p, child: Text(p)))
                .toList(),
            onChanged: (v) { setState(() { _poste = v!; _loading = true; }); _load(); },
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _commandes.isEmpty
                  ? const Center(child: Text('Aucune commande en cours'))
                  : ListView.builder(
                      padding: const EdgeInsets.all(12),
                      itemCount: _commandes.length,
                      itemBuilder: (context, i) => _CommandeCard(
                        commande: _commandes[i] as Map<String, dynamic>,
                        onAvancer: _avancer,
                      ),
                    ),
    );
  }
}

class _CommandeCard extends StatelessWidget {
  final Map<String, dynamic> commande;
  final Future<void> Function(String) onAvancer;

  const _CommandeCard({required this.commande, required this.onAvancer});

  @override
  Widget build(BuildContext context) {
    final lignes = (commande['lignes'] as List? ?? [])
        .where((l) => (l as Map)['posteCible'] == 'cuisine' || (l)['posteCible'] == null)
        .toList();
    final created = DateTime.tryParse(commande['createdAt'] ?? '');
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    commande['place'] != null
                        ? 'Place ${(commande['place'] as Map)['numero']}'
                        : 'À emporter',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Text(
                  created != null
                      ? DateFormat('HH:mm').format(created.toLocal())
                      : '',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
            const SizedBox(height: 8),
            ...lignes.map((l) {
              final ligne = l as Map<String, dynamic>;
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Text('• ${ligne['quantite']}× ${ligne['produit']?['nom'] ?? ligne['produitId']}'),
              );
            }),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.tonal(
                onPressed: () => onAvancer(commande['id'] as String),
                child: const Text('→ En préparation'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
