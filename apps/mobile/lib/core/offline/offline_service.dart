import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import 'offline_store.dart';

/// Service hors ligne : détection connectivité, file de commandes
/// et synchronisation automatique au retour du réseau.
///
/// Règles :
/// - POST /clients/commandes échoue sur erreur réseau → enqueue local
///   avec l'idempotencyKey (le serveur déduplique si double envoi).
/// - Erreur 4xx → rejet définitif, on sort de la file.
/// - Au retour réseau → flush séquentiel de la file.
class OfflineService extends ChangeNotifier {
  OfflineService._();
  static final OfflineService instance = OfflineService._();

  bool _online = true;
  bool get online => _online;
  int pendingCount = 0;
  bool _syncing = false;

  StreamSubscription? _connSub;

  void init() {
    if (_connSub != null) return;
    Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online != _online) {
        _online = online;
        notifyListeners();
        if (online) unawaited(syncPending());
      }
    });
    unawaited(refreshPendingCount());
  }

  Future<void> refreshPendingCount() async {
    pendingCount = (await OfflineStore.instance.readQueue()).length;
    notifyListeners();
  }

  /// Vrai si l'erreur Dio est réseau/timeout (pas une réponse HTTP).
  bool isNetworkError(Object e) =>
      e is DioException &&
      (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout);

  /// Enfile une commande pour envoi différé.
  Future<void> enqueueOrder({
    required String slug,
    required String placeId,
    required String idempotencyKey,
    required List<Map<String, dynamic>> lignes,
  }) async {
    await OfflineStore.instance.enqueue({
      'id': idempotencyKey, // = idempotencyKey → dédup serveur
      'slug': slug,
      'placeId': placeId,
      'idempotencyKey': idempotencyKey,
      'lignes': lignes,
      'createdAt': DateTime.now().toIso8601String(),
      'attempts': 0,
    });
    await refreshPendingCount();
  }

  /// Tente d'envoyer une commande ; en cas d'erreur réseau, l'enfile.
  /// Retourne l'id de commande si acceptée, null si mise en file.
  Future<String?> submitOrder({
    required String slug,
    required String placeId,
    required String idempotencyKey,
    required List<Map<String, dynamic>> lignes,
  }) async {
    try {
      final res = await ApiClient.instance.dio.post('/clients/commandes', data: {
        'slug': slug,
        'placeId': placeId,
        'idempotencyKey': idempotencyKey,
        'lignes': lignes,
      });
      return res.data is Map ? res.data['id'] as String? : null;
    } catch (e) {
      if (isNetworkError(e)) {
        await enqueueOrder(
          slug: slug, placeId: placeId,
          idempotencyKey: idempotencyKey, lignes: lignes,
        );
        return null;
      }
      rethrow; // 4xx : erreur métier, pas de retry
    }
  }

  /// Vide la file — appelé au retour réseau et manuellement.
  Future<void> syncPending() async {
    if (_syncing || !_online) return;
    _syncing = true;
    try {
      final queue = await OfflineStore.instance.readQueue();
      final remaining = <Map<String, dynamic>>[];
      for (final order in queue) {
        try {
          await ApiClient.instance.dio.post('/clients/commandes', data: {
            'slug': order['slug'],
            'placeId': order['placeId'],
            'idempotencyKey': order['idempotencyKey'],
            'lignes': order['lignes'],
          });
          // Succès → sortie de file (idempotencyKey déduplique si replay).
        } catch (e) {
          if (!isNetworkError(e)) {
            // Rejet métier (place prise, produit indispo…) : on sort
            // de la file — l'utilisateur est notifié via la cloche.
          } else {
            order['attempts'] = (order['attempts'] as int? ?? 0) + 1;
            remaining.add(order);
          }
        }
      }
      await OfflineStore.instance.writeQueue(remaining);
      await refreshPendingCount();
    } finally {
      _syncing = false;
    }
  }
}
