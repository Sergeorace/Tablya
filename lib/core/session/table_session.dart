import 'package:flutter/foundation.dart';

/// Contexte de table scannée (QR) — partagé entre Scan → Menu → Panier.
/// Le qrToken est opaque ; le slug identifie l'établissement.
class TableSession {
  TableSession({required this.slug, required this.qrToken, this.placeId, this.placeNumero});

  final String slug;
  final String qrToken;
  final String? placeId;
  final String? placeNumero;

  String get label => placeNumero != null ? 'Table $placeNumero' : 'Sur place';
}

/// Singleton simple — une table à la fois par appareil.
class TableSessionStore extends ChangeNotifier {
  TableSession? _current;
  TableSession? get current => _current;

  void set(TableSession s) {
    _current = s;
    notifyListeners();
  }

  void clear() {
    _current = null;
    notifyListeners();
  }
}

final tableSessionStore = TableSessionStore();
