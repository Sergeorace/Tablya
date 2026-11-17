import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/api/socket_service.dart';

/// Paiement mobile money + suivi live d'une commande client.
/// POST /clients/commandes/:id/paiements (JWT client, ownership vérifié
/// côté serveur) puis polling + socket 'commande.statut' en fallback.
class PaiementScreen extends StatefulWidget {
  const PaiementScreen({super.key, required this.commandeId});

  final String commandeId;

  @override
  State<PaiementScreen> createState() => _PaiementScreenState();
}

class _PaiementScreenState extends State<PaiementScreen> {
  static const _moyens = {
    'tmoney': 'TMoney',
    'moov': 'Moov Money',
    'flooz': 'Moov Flooz',
    'carte': 'Carte bancaire',
  };

  String _moyen = 'tmoney';
  final _phone = TextEditingController();
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _instructions;
  String _statut = '';
  String _totalCentimes = '0';
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    SocketService.instance.connect();
    _loadStatut();
    // Polling de secours (réseaux instables) — le socket reste prioritaire.
    _poll = Timer.periodic(const Duration(seconds: 8), (_) => _loadStatut());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _loadStatut() async {
    try {
      final res = await ApiClient.instance.dio.get('/clients/commandes/${widget.commandeId}');
      if (!mounted) return;
      final d = res.data as Map<String, dynamic>;
      setState(() {
        _statut = (SocketService.instance.statutParCommande[widget.commandeId] ??
            d['statut'] ??
            '') as String;
        _totalCentimes = '${d['totalCentimes'] ?? '0'}';
      });
      if (_statut == 'cloturee' || _statut == 'annulee') _poll?.cancel();
    } catch (_) {/* silencieux — prochain tick */}
  }

  String _uuid() {
    // UUID v4 minimal (pas de dépendance uuid dans pubspec).
    final b = List<int>.generate(16, (_) => DateTime.now().microsecondsSinceEpoch % 256);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    String h(int i) => b[i].toRadixString(16).padLeft(2, '0');
    return '${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-'
        '${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}';
  }

  Future<void> _payer() async {
    setState(() { _busy = true; _error = null; });
    try {
      final res = await ApiClient.instance.dio.post(
        '/clients/commandes/${widget.commandeId}/paiements',
        data: {
          'moyen': _moyen,
          'clientPhone': _phone.text.trim().isEmpty ? null : _phone.text.trim(),
          'idempotencyKey': _uuid(),
        },
      );
      if (!mounted) return;
      setState(() {
        _instructions = (res.data['instructions'] as Map?)?.cast<String, dynamic>();
      });
      _loadStatut();
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.response?.data is Map
          ? (e.response!.data['message'] ?? 'Paiement refusé.').toString()
          : 'Paiement impossible — réessayez.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##0', 'fr_FR');
    final cloturee = _statut == 'cloturee';
    return Scaffold(
      appBar: AppBar(title: const Text('Paiement')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // Statut live (socket prioritaire, polling en secours)
          Card(
            child: ListTile(
              leading: Icon(
                cloturee ? Icons.check_circle : Icons.schedule,
                color: cloturee ? Colors.green : Colors.orange,
              ),
              title: Text(cloturee ? 'Commande réglée' : 'Suivi de la commande'),
              subtitle: Text(_statut.isEmpty ? '…' : _statut.replaceAll('_', ' ')),
              trailing: SocketService.instance.connected
                  ? const Icon(Icons.wifi, size: 18)
                  : const Icon(Icons.wifi_off, size: 18),
            ),
          ),
          const SizedBox(height: 16),
          if (!cloturee) ...[
            Text('Mode de paiement', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: _moyens.entries
                  .map((e) => ChoiceChip(
                        label: Text(e.value),
                        selected: _moyen == e.key,
                        onSelected: (_) => setState(() => _moyen = e.key),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Numéro mobile money (optionnel)',
                hintText: '+228 90 00 00 00',
                prefixIcon: Icon(Icons.phone_android),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Vous recevrez une demande de confirmation sur votre téléphone. '
              'Le montant exact est calculé côté serveur.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _payer,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 14),
                child: Text(_busy ? 'Initiation…' : 'Payer'),
              ),
            ),
          ],
          if (_instructions != null) ...[
            const SizedBox(height: 16),
            Card(
              color: Colors.blue.shade50,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Instructions de paiement',
                        style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 8),
                    ..._instructions!.entries.map((e) => Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2),
                          child: Text('${e.key} : ${e.value}'),
                        )),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: 24),
          Center(
            child: Text(
              'Montant : ${fmt.format(int.tryParse(_totalCentimes) != null ? int.parse(_totalCentimes) / 100 : 0)} F',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}
