import 'dart:math';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/session/table_session.dart';
import '../../core/offline/offline_service.dart';
import '../../core/offline/offline_store.dart';
import 'otp_login_screen.dart';
import 'paiement_screen.dart';

// ---------- Modèles ----------

class Variante {
  Variante({required this.id, required this.nom, required this.prixCentimes});
  final String id;
  final String nom;
  final int prixCentimes;
}

class Produit {
  Produit({
    required this.id, required this.nom, required this.description,
    required this.variantes,
  });
  final String id;
  final String nom;
  final String? description;
  final List<Variante> variantes;

  factory Produit.fromJson(Map<String, dynamic> j) => Produit(
        id: j['id'] as String,
        nom: j['nom'] as String,
        description: j['description'] as String?,
        variantes: ((j['variantes'] as List?) ?? [])
            .map((v) => Variante(
                  id: v['id'] as String,
                  nom: v['nom'] as String,
                  prixCentimes: int.parse(v['prixCentimes'].toString()),
                ))
            .toList(),
      );
}

class CartLine {
  CartLine({
    required this.produitId, required this.varianteId,
    required this.nom, required this.quantite, required this.prixCentimes,
  });
  final String produitId;
  final String varianteId;
  String nom;
  int quantite;
  final int prixCentimes;
  int get totalCentimes => prixCentimes * quantite;
}

// ---------- MenuScreen ----------

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  List<Map<String, dynamic>> _categories = [];
  String _etabNom = '';
  bool _loading = true;
  String? _error;
  String? _selectedCategorie;
  bool _offline = false; // menu servi depuis le cache local
  final Map<String, CartLine> _cart = {};

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

  Future<void> _load() async {
    final session = tableSessionStore.current;
    if (session == null) {
      setState(() { _loading = false; _error = 'Aucune table scannée — scannez le QR de votre table.'; });
      return;
    }
    try {
      final res = await ApiClient.instance.dio
          .get('/public/etablissements/${session.slug}/menu');
      await OfflineStore.instance.writeMenuCache(session.slug, res.data);
      if (!mounted) return;
      setState(() {
        _categories = (res.data['categories'] as List).cast<Map<String, dynamic>>();
        _etabNom = res.data['etablissement']?['nom'] ?? '';
        _offline = false;
        _loading = false;
      });
    } catch (_) {
      // Hors ligne / serveur injoignable → repli sur le cache local.
      final cache = await OfflineStore.instance.readMenuCache(session.slug);
      if (!mounted) return;
      final data = cache?['data'];
      if (data is Map<String, dynamic> && data['categories'] is List) {
        setState(() {
          _categories = (data['categories'] as List).cast<Map<String, dynamic>>();
          _etabNom = data['etablissement'] is Map
              ? (data['etablissement']['nom'] ?? '')
              : '';
          _offline = true;
          _loading = false;
        });
      } else {
        setState(() { _loading = false; _error = 'Menu indisponible — réessayez.'; });
      }
    }
  }

  int get _cartCount => _cart.values.fold(0, (s, l) => s + l.quantite);
  int get _cartTotal => _cart.values.fold(0, (s, l) => s + l.totalCentimes);

  void _addToCart(Produit p, Variante v) {
    final key = '${p.id}:${v.id}';
    setState(() {
      final existing = _cart[key];
      if (existing != null) {
        existing.quantite += 1;
      } else {
        _cart[key] = CartLine(
          produitId: p.id, varianteId: v.id,
          nom: p.variantes.length > 1 ? '${p.nom} (${v.nom})' : p.nom,
          quantite: 1, prixCentimes: v.prixCentimes,
        );
      }
    });
  }

  void _showProductSheet(Produit p) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(p.nom, style: Theme.of(ctx).textTheme.titleLarge),
              if (p.description != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(p.description!, style: Theme.of(ctx).textTheme.bodyMedium),
                ),
              const SizedBox(height: 16),
              ...p.variantes.map((v) => ListTile(
                    title: Text(v.nom),
                    trailing: Text(_fmt(v.prixCentimes)),
                    onTap: () {
                      Navigator.pop(ctx);
                      _addToCart(p, v);
                    },
                  )),
            ],
          ),
        ),
      ),
    );
  }

  void _showCart() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Votre commande', style: Theme.of(ctx).textTheme.titleLarge),
                const SizedBox(height: 8),
                ..._cart.values.map((l) => ListTile(
                      dense: true,
                      title: Text(l.nom),
                      subtitle: Text(_fmt(l.prixCentimes)),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.remove_circle_outline),
                            onPressed: () => setSheet(() {
                              if (l.quantite > 1) {
                                l.quantite -= 1;
                              } else {
                                _cart.removeWhere((_, v) => identical(v, l));
                              }
                              setState(() {});
                            }),
                          ),
                          Text('${l.quantite}'),
                          IconButton(
                            icon: const Icon(Icons.add_circle_outline),
                            onPressed: () => setSheet(() {
                              l.quantite += 1;
                              setState(() {});
                            }),
                          ),
                        ],
                      ),
                    )),
                const Divider(),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Total', style: TextStyle(fontWeight: FontWeight.bold)),
                    Text(_fmt(_cartTotal), style: const TextStyle(fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _cart.isEmpty ? null : _commander,
                    child: const Padding(
                      padding: EdgeInsets.symmetric(vertical: 14),
                      child: Text('Commander'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _fmt(int centimes) =>
      '${NumberFormat('#,##0', 'fr_FR').format(centimes / 100)} F';

  static String _uuid() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    String h(int i) => b[i].toRadixString(16).padLeft(2, '0');
    return '${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-'
        '${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}';
  }

  Future<void> _commander() async {
    final session = tableSessionStore.current;
    if (session == null || _cart.isEmpty) return;
    final logged = await ApiClient.instance.isLoggedIn;
    if (!mounted) return;
    if (!logged) {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const OtpLoginScreen()),
      );
      return;
    }
    final lignes = _cart.values
        .map((l) => {'produitId': l.produitId, 'varianteId': l.varianteId, 'quantite': l.quantite})
        .toList();
    try {
      final commandeId = await OfflineService.instance.submitOrder(
        slug: session.slug,
        placeId: session.placeId,
        idempotencyKey: _uuid(),
        lignes: lignes.cast<Map<String, dynamic>>(),
      );
      if (!mounted) return;
      setState(_cart.clear);
      Navigator.of(context).pop(); // ferme le panier
      if (commandeId == null) {
        // Erreur réseau → commande en file, sync auto au retour réseau.
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Hors ligne — commande enregistrée, envoi automatique au retour du réseau.'),
            duration: Duration(seconds: 4),
          ),
        );
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Commande envoyée — paiement et suivi')),
      );
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => PaiementScreen(commandeId: commandeId)),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Commande impossible — réessayez.')),
      );
    }
  }

  @override
  void dispose() {
    OfflineService.instance.removeListener(_onOfflineChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Menu')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!),
              TextButton(onPressed: _load, child: const Text('Réessayer')),
            ],
          ),
        ),
      );
    }

    final visibles = _selectedCategorie == null
        ? _categories
        : _categories.where((c) => c['id'] == _selectedCategorie).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(_etabNom.isEmpty ? 'Menu' : _etabNom),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(52),
          child: SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: const Text('Tout'),
                    selected: _selectedCategorie == null,
                    onSelected: (_) => setState(() => _selectedCategorie = null),
                  ),
                ),
                ..._categories.map((c) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(c['nom'] as String),
                        selected: _selectedCategorie == c['id'],
                        onSelected: (_) => setState(() => _selectedCategorie = c['id'] as String),
                      ),
                    )),
              ],
            ),
          ),
        ),
      ),
      body: Column(
        children: [
          // Bandeau hors ligne : menu en cache et/ou file d'attente.
          if (_offline ||
              !OfflineService.instance.online ||
              OfflineService.instance.pendingCount > 0)
            Container(
              width: double.infinity,
              color: Colors.orange.shade100,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                _offline
                    ? 'Hors ligne — menu en cache'
                    : 'Mode dégradé — ${OfflineService.instance.pendingCount} commande(s) en attente de synchronisation',
                style: TextStyle(fontSize: 12, color: Colors.orange.shade900),
              ),
            ),
          Expanded(
            child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: visibles.fold<int>(0, (s, c) => s + ((c['produits'] as List?)?.length ?? 0)),
        itemBuilder: (context, index) {
          var rest = index;
          for (final c in visibles) {
            final produits = (c['produits'] as List?) ?? [];
            if (rest < produits.length) {
              final p = Produit.fromJson(produits[rest] as Map<String, dynamic>);
              final v0 = p.variantes.isNotEmpty ? p.variantes.first : null;
              return Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: ListTile(
                  title: Text(p.nom),
                  subtitle: Text(
                    p.description ?? (v0 != null ? _fmt(v0.prixCentimes) : ''),
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                  ),
                  trailing: v0 == null
                      ? null
                      : Text(_fmt(v0.prixCentimes),
                          style: const TextStyle(fontWeight: FontWeight.bold)),
                  onTap: p.variantes.isEmpty ? null : () => _showProductSheet(p),
                ),
              );
            }
            rest -= produits.length;
          }
          return const SizedBox.shrink();
        },
            ),
          ),
        ],
      ),
      floatingActionButton: _cartCount > 0
          ? FloatingActionButton.extended(
              onPressed: _showCart,
              icon: const Icon(Icons.shopping_cart_checkout),
              label: Text('$_cartCount · ${_fmt(_cartTotal)}'),
            )
          : null,
    );
  }
}
