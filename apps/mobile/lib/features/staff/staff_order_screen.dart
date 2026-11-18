import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/offline/offline_service.dart';
import '../../core/offline/offline_store.dart';

/// Prise de commande staff (POS) — fonctionne hors ligne :
/// catalogue en cache, commande enfilée si erreur réseau,
/// sync automatique au retour réseau (POST /commandes idempotent).
class StaffOrderScreen extends StatefulWidget {
  const StaffOrderScreen({super.key});

  @override
  State<StaffOrderScreen> createState() => _StaffOrderScreenState();
}

class _StaffOrderScreenState extends State<StaffOrderScreen> {
  List<dynamic> _places = [];
  List<dynamic> _produits = [];
  bool _loading = true;
  String? _error;
  bool _offline = false;

  String? _placeId; // null = à emporter
  String _type = 'emporter';
  final Map<String, int> _cart = {}; // produitId → quantite
  String _search = '';

  @override
  void initState() {
    super.initState();
    OfflineService.instance.init();
    OfflineService.instance.addListener(_onOfflineChanged);
    _load();
  }

  void _onOfflineChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    OfflineService.instance.removeListener(_onOfflineChanged);
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await ApiClient.instance.dio.get('/pos/catalogue');
      final data = {'places': res.data['places'], 'produits': res.data['produits']};
      await OfflineStore.instance.writeStaffCatalogue(data);
      if (!mounted) return;
      setState(() {
        _places = res.data['places'] as List;
        _produits = res.data['produits'] as List;
        _offline = false;
        _loading = false;
      });
    } catch (_) {
      // Repli cache catalogue.
      final cache = await OfflineStore.instance.readStaffCatalogue();
      final data = cache?['data'];
      if (!mounted) return;
      if (data is Map<String, dynamic>) {
        setState(() {
          _places = (data['places'] as List?) ?? [];
          _produits = (data['produits'] as List?) ?? [];
          _offline = true;
          _loading = false;
        });
      } else {
        setState(() { _loading = false; _error = 'Catalogue indisponible'; });
      }
    }
  }

  String _fmt(dynamic centimes) {
    final v = int.tryParse('$centimes') ?? 0;
    return NumberFormat('#,##0', 'fr_FR').format(v ~/ 100) + ' F';
  }

  int get _cartCount => _cart.values.fold(0, (a, b) => a + b);
  int get _cartTotal {
    var total = 0;
    for (final e in _cart.entries) {
      final p = _produits.firstWhere((x) => x['id'] == e.key, orElse: () => null);
      if (p == null) continue;
      final v = (p['variantes'] as List?)?.isNotEmpty == true
          ? p['variantes'][0]
          : null;
      if (v != null) total += (int.tryParse('${v['prixCentimes']}') ?? 0) * e.value;
    }
    return total;
  }

  String _uuid() {
    final b = List<int>.generate(16, (_) => DateTime.now().microsecondsSinceEpoch % 256);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    String h(int i) => b[i].toRadixString(16).padLeft(2, '0');
    return '${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-'
        '${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}';
  }

  Future<void> _envoyer() async {
    if (_cart.isEmpty) return;
    // Lignes : produit + première variante active (prix serveur de toute
    // façon recalculé — varianteId explicite quand disponible).
    final lignes = <Map<String, dynamic>>[];
    for (final e in _cart.entries) {
      final p = _produits.firstWhere((x) => x['id'] == e.key, orElse: () => null);
      if (p == null) continue;
      final vs = (p['variantes'] as List?) ?? [];
      lignes.add({
        'produitId': e.key,
        if (vs.isNotEmpty) 'varianteId': vs[0]['id'],
        'quantite': e.value,
      });
    }
    if (lignes.isEmpty) return;

    try {
      final id = await OfflineService.instance.submitStaffOrder(
        placeId: _placeId,
        type: _type,
        idempotencyKey: _uuid(),
        lignes: lignes,
        metadataHorsLigne: _offline ? {'origine': 'mode_hors_ligne'} : null,
      );
      if (!mounted) return;
      setState(() {
        _cart.clear();
        _placeId = null;
        _type = 'emporter';
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(id == null
            ? 'Hors ligne — commande en file, envoi auto au retour réseau'
            : 'Commande ${id.substring(0, 8)} envoyée'),
      ));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Commande refusée par le serveur')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final produitsFiltres = (_produits as List).where((p) {
      final nom = (p['nom'] as String? ?? '').toLowerCase();
      return _search.isEmpty || nom.contains(_search.toLowerCase());
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Prise de commande'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(96),
          child: Column(
            children: [
              if (_offline || !OfflineService.instance.online ||
                  OfflineService.instance.staffPendingCount > 0)
                Container(
                  width: double.infinity,
                  color: Colors.orange.shade100,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Text(
                    _offline
                        ? 'Hors ligne — catalogue en cache'
                        : '${OfflineService.instance.staffPendingCount} commande(s) en attente de sync',
                    style: TextStyle(fontSize: 12, color: Colors.orange.shade900),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
                child: Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _type,
                        decoration: const InputDecoration(
                          labelText: 'Type', isDense: true,
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(value: 'sur_place', child: Text('Sur place')),
                          DropdownMenuItem(value: 'emporter', child: Text('À emporter')),
                          DropdownMenuItem(value: 'livraison', child: Text('Livraison')),
                        ],
                        onChanged: (v) => setState(() {
                          _type = v!;
                          if (_type != 'sur_place') _placeId = null;
                        }),
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (_type == 'sur_place')
                      Expanded(
                        flex: 2,
                        child: DropdownButtonFormField<String>(
                          value: _placeId,
                          decoration: const InputDecoration(
                            labelText: 'Place', isDense: true,
                            border: OutlineInputBorder(),
                          ),
                          items: [
                            const DropdownMenuItem(value: '', child: Text('—')),
                            ..._places.map((p) => DropdownMenuItem(
                                  value: p['id'] as String,
                                  child: Text(
                                    '${(p['zone'] as Map?)?['nom'] ?? ''} ${p['numero']} (${p['capacite']}p)',
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                )),
                          ],
                          onChanged: (v) => setState(() => _placeId = (v?.isEmpty ?? true) ? null : v),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: TextField(
                        decoration: const InputDecoration(
                          hintText: 'Rechercher un produit…',
                          prefixIcon: Icon(Icons.search),
                          isDense: true,
                        ),
                        onChanged: (v) => setState(() => _search = v),
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        children: [
                          ...produitsFiltres.map((p) {
                            final id = p['id'] as String;
                            final vs = (p['variantes'] as List?) ?? [];
                            final prix = vs.isNotEmpty
                                ? _fmt(vs[0]['prixCentimes'])
                                : '';
                            final indisponible = p['disponible'] == false;
                            final qte = _cart[id] ?? 0;
                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              child: ListTile(
                                title: Text(p['nom'] as String,
                                    style: indisponible
                                        ? const TextStyle(decoration: TextDecoration.lineThrough)
                                        : null),
                                subtitle: Text([
                                  if ((p['categorie'] as Map?)?['nom'] != null)
                                    (p['categorie'] as Map)['nom'],
                                  prix,
                                  if (indisponible) 'indisponible',
                                ].whereType<String>().join(' · ')),
                                trailing: indisponible
                                    ? null
                                    : Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          if (qte > 0) ...[
                                            IconButton(
                                              icon: const Icon(Icons.remove_circle_outline),
                                              onPressed: () => setState(() {
                                                if (qte <= 1) {
                                                  _cart.remove(id);
                                                } else {
                                                  _cart[id] = qte - 1;
                                                }
                                              }),
                                            ),
                                            Text('$qte'),
                                          ],
                                          IconButton(
                                            icon: const Icon(Icons.add_circle, color: Colors.teal),
                                            onPressed: () => setState(() {
                                              _cart[id] = qte + 1;
                                            }),
                                          ),
                                        ],
                                      ),
                              ),
                            );
                          }),
                          if (produitsFiltres.isEmpty)
                            const Padding(
                              padding: EdgeInsets.all(24),
                              child: Center(child: Text('Aucun produit')),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
      bottomNavigationBar: _cartCount > 0
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: FilledButton.icon(
                  onPressed: _envoyer,
                  icon: const Icon(Icons.send),
                  label: Text('Envoyer · $_cartCount · ${_fmt(_cartTotal)}'),
                ),
              ),
            )
          : null,
    );
  }
}
