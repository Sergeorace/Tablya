import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';

/// Historique + suivi des commandes client (GET /clients/commandes).
class CommandesScreen extends StatefulWidget {
  const CommandesScreen({super.key});

  @override
  State<CommandesScreen> createState() => _CommandesScreenState();
}

class _CommandesScreenState extends State<CommandesScreen> {
  List<dynamic> _commandes = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.dio.get('/clients/commandes');
      if (!mounted) return;
      setState(() {
        _commandes = res.data as List;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; _error = 'Impossible de charger vos commandes.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##0', 'fr_FR');
    return Scaffold(
      appBar: AppBar(title: const Text('Mes commandes')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _commandes.isEmpty
                  ? const Center(child: Text('Aucune commande pour le moment'))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(12),
                        itemCount: _commandes.length,
                        itemBuilder: (context, i) {
                          final c = _commandes[i] as Map<String, dynamic>;
                          final created = DateTime.tryParse(c['createdAt'] ?? '');
                          return Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: ListTile(
                              title: Text(
                                c['place'] != null
                                    ? 'Table ${(c['place'] as Map)['numero']}'
                                    : 'Commande ${c['type'] ?? ''}',
                              ),
                              subtitle: Text([
                                if (created != null)
                                  DateFormat('dd/MM HH:mm').format(created.toLocal()),
                                c['statut'] ?? '',
                              ].join(' · ')),
                              trailing: Text('${fmt.format(c['totalCentimes'] != null ? (c['totalCentimes'] as num) / 100 : 0)} F'),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }
}
