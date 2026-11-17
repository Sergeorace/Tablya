import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api_client.dart';

/// Suivi temps réel des commandes client via Socket.IO.
/// Le serveur joint automatiquement la room `client:{id}` au handshake
/// (JWT 'client') — pas besoin de join manuel. Le polling REST reste
/// le fallback quand le socket est déconnecté.
class SocketService extends ChangeNotifier {
  SocketService._();
  static final SocketService instance = SocketService._();

  io.Socket? _socket;
  bool _connected = false;
  bool get connected => _connected;

  /// Dernier statut connu par commandeId (alimente le suivi live).
  final Map<String, String> statutParCommande = {};

  Future<void> connect() async {
    if (_socket != null) return;
    // http://host:port/api/v1 → ws://host:port (namespace racine)
    final base = ApiClient.instance.dio.options.baseUrl;
    final uri = base
        .replaceFirst('http://', 'ws://')
        .replaceFirst('https://', 'wss://')
        .replaceAll('/api/v1', '');
    final token = await ApiClient.instance.accessToken;
    _socket = io.io(
      uri,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .build(),
    );

    _socket!
      ..onConnect((_) {
        _connected = true;
        notifyListeners();
      })
      ..onDisconnect((_) {
        _connected = false;
        notifyListeners();
      })
      ..on('commande.statut', _onStatut)
      ..on('commande.nouvelle', _onNouvelle);
  }

  void _onStatut(dynamic data) {
    final d = data as Map<String, dynamic>;
    final id = d['commandeId'] as String?;
    final statut = d['statut'] as String?;
    if (id != null && statut != null) {
      statutParCommande[id] = statut;
      notifyListeners();
    }
  }

  void _onNouvelle(dynamic data) {
    final d = data as Map<String, dynamic>;
    final id = d['id'] as String?;
    if (id != null) {
      statutParCommande[id] = 'recue';
      notifyListeners();
    }
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
    _connected = false;
  }
}
