import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/api/api_client.dart';
import '../../core/offline/offline_service.dart';

/// Caisse : encaissement espèces des commandes servies + clôture Z du jour.
/// Permissions : caisse.encaisser (encaissement), caisse.cloturer (clôture).
class CaisseScreen extends StatefulWidget {
  const CaisseScreen({super.key});

  @override
  State<CaisseScreen> createState() => _CaisseScreenState();
}

class _CaisseScreenState extends State<CaisseScreen> {
  List<dynamic>? _commandes;
  Map<String, dynamic>? _rapport;
  String? _error;
  bool _loading = true;
  bool _cloturant = false;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  String _xof(dynamic centimes) {
    final v = int.tryParse('$centimes') ?? 0;
    final s = (v / 100).round().toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return '$buf F';
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.dio.get('/commandes');
      final list = (res.data as List?) ?? [];
      // Encaisseables : servie ou prete, pas encore encaissées (especes).
      final encaisables = list.where((c) =>
          (c['statut'] == 'servie' || c['statut'] == 'prete') &&
          (c['modePaiementPrevu'] == null || c['modePaiementPrevu'] == 'especes'))
          .toList();
      if (mounted) {
        setState(() {
          _commandes = encaisables;
          _loading = false;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() {
        _loading = false;
        _error = 'Impossible de charger les commandes.';
      });
    }
  }

  Future<void> _encaisser(String commandeId) async {
    try {
      await ApiClient.instance.dio.post('/commandes/$commandeId/encaisser-especes');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Encaissement enregistré.')),
        );
      }
      _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Encaissement impossible — déjà encaissé ou statut invalide.')),
        );
      }
    }
  }

  Future<void> _cloturer() async {
    final now = DateTime.now();
    final date = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clôturer la caisse ?'),
        content: Text('Z de caisse pour le $date. Cette action est tracée en audit.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Annuler')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Clôturer')),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _cloturant = true);
    try {
      final res = await ApiClient.instance.dio.post('/caisse/cloturer', data: {'dateJour': date});
      if (mounted) setState(() => _rapport = res.data as Map<String, dynamic>);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Clôture impossible — permission caisse.cloturer requise.')),
        );
      }
    } finally {
      if (mounted) setState(() => _cloturant = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pending = OfflineService.instance.pendingCount;
    return Scaffold(
      appBar: AppBar(title: const Text('Caisse')),
      body: Column(
        children: [
          if (pending > 0)
            Container(
              width: double.infinity,
              color: Colors.orange.shade800,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                '$pending commande(s) en attente de synchronisation',
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
            ),
          if (_rapport != null) _rapportCard(),
          Expanded(child: _buildList()),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _cloturant ? null : _cloturer,
                  icon: const Icon(Icons.lock_clock),
                  label: Text(_cloturant ? 'Clôture…' : 'Clôturer la caisse (Z)'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _rapportCard() {
    final r = _rapport!;
    final parF = (r['parFournisseur'] as Map?) ?? {};
    return Card(
      margin: const EdgeInsets.all(16),
      color: Colors.teal.shade50,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Z — ${r['dateJour']}', style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text('Commandes : ${r['commandes']} · Transactions : ${r['transactions']}'),
          Text('Total encaissé : ${_xof(r['totalEncaisseCentimes'])}'),
          Text('Remboursé : ${_xof(r['totalRembourseCentimes'])}'),
          Text('Net : ${_xof(r['netCentimes'])}', style: const TextStyle(fontWeight: FontWeight.bold)),
          Text('Commissions plateforme : ${_xof(r['commissionsPlateformeCentimes'])}'),
          if (parF.isNotEmpty) ...[
            const Divider(),
            for (final e in parF.entries)
              Text('${e.key} : ${_xof((e.value as Map)['encaisseCentimes'])} (${(e.value as Map)['nombre']} tx)'),
          ],
          const SizedBox(height: 8),
          TextButton(onPressed: () => setState(() => _rapport = null), child: const Text('Fermer')),
        ]),
      ),
    );
  }

  Widget _buildList() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Text(_error!, style: const TextStyle(color: Colors.red)));
    }
    final list = _commandes ?? [];
    if (list.isEmpty) {
      return const Center(child: Text('Aucune commande à encaisser.'));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: list.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final c = list[i];
        final place = c['place'] as Map?;
        final lieu = place != null ? 'Place ${place['numero']}' : c['type'] ?? '';
        return Card(
          child: ListTile(
            title: Text('${lieu} — ${_xof(c['totalCentimes'])}'),
            subtitle: Text('${c['statut']} · ${c['createdAt'] != null ? DateTime.tryParse('${c['createdAt']}')?.toLocal().toString().substring(0, 16) ?? '' : ''}'),
            trailing: FilledButton(
              onPressed: () => _encaisser('${c['id']}'),
              child: const Text('Encaisser'),
            ),
          ),
        );
      },
    );
  }
}
