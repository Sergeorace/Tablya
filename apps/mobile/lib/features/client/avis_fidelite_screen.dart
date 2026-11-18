import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';

/// Espace client : points de fidélité par établissement + dépôt d'avis
/// sur les commandes clôturées (un avis par commande, note 1–5).
class AvisFideliteScreen extends StatefulWidget {
  const AvisFideliteScreen({super.key});

  @override
  State<AvisFideliteScreen> createState() => _AvisFideliteScreenState();
}

class _AvisFideliteScreenState extends State<AvisFideliteScreen> {
  List<dynamic>? _fidelite;
  List<dynamic>? _commandes;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        ApiClient.instance.dio.get('/clients/fidelite'),
        ApiClient.instance.dio.get('/clients/commandes'),
      ]);
      final fidelite = (results[0].data as List?) ?? [];
      final commandes = ((results[1].data as Map?)?['data'] as List?) ??
          ((results[1].data as List?) ?? []);
      // Seules les commandes clôturées peuvent recevoir un avis.
      final cloturees = commandes
          .where((c) => c is Map && c['statut'] == 'cloturee')
          .toList();
      if (mounted) {
        setState(() {
          _fidelite = fidelite;
          _commandes = cloturees;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Impossible de charger vos données. Connectez-vous par OTP.';
        });
      }
    }
  }

  Future<void> _ouvrirAvis(Map<String, dynamic> commande) async {
    var note = 5;
    final commentaireCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Votre avis'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (i) => IconButton(
                icon: Icon(i < note ? Icons.star : Icons.star_border,
                    color: Colors.amber, size: 32),
                onPressed: () => setD(() => note = i + 1),
              )),
            ),
            TextField(
              controller: commentaireCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'Commentaire (optionnel)',
                border: OutlineInputBorder(),
              ),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Envoyer')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      await ApiClient.instance.dio.post('/avis', data: {
        'commandeId': commande['id'],
        'note': note,
        if (commentaireCtrl.text.trim().isNotEmpty)
          'commentaire': commentaireCtrl.text.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Merci pour votre avis !')),
        );
        setState(() => _commandes = _commandes!.where((c) => c['id'] != commande['id']).toList());
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Avis déjà déposé ou commande invalide.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Avis & fidélité')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      const Text('Points de fidélité',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      const SizedBox(height: 8),
                      if ((_fidelite ?? []).isEmpty)
                        const Text('Aucun point pour l\'instant — 1 pt par 1 000 F réglés.'),
                      ...(_fidelite ?? []).map((f) {
                        final etab = (f['etablissement'] as Map?)?['raisonSociale'] ?? '';
                        return Card(
                          child: ListTile(
                            leading: const Icon(Icons.card_giftcard, color: Colors.teal),
                            title: Text(etab.toString()),
                            trailing: Text('${f['points'] ?? 0} pts',
                                style: const TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        );
                      }),
                      const SizedBox(height: 24),
                      const Text('Noter une commande',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      const SizedBox(height: 8),
                      if ((_commandes ?? []).isEmpty)
                        const Text('Aucune commande clôturée à évaluer.'),
                      ...(_commandes ?? []).map((c) {
                        final m = c as Map;
                        return Card(
                          child: ListTile(
                            title: Text('Commande ${m['id']?.toString().substring(0, 8) ?? ''}'),
                            subtitle: Text(m['totalCentimes'] != null
                                ? '${(int.tryParse('${m['totalCentimes']}') ?? 0) / 100} F'
                                : ''),
                            trailing: TextButton(
                              onPressed: () => _ouvrirAvis(m),
                              child: const Text('Noter'),
                            ),
                          ),
                        );
                      }),
                    ],
                  ),
                ),
    );
  }
}
