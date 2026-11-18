import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';

/// Persistance hors ligne sans codegen (fichiers JSON dans
/// l'espace documents de l'app — suffisant pour une file de commandes
/// et le cache menu ; drift/SQLite reste disponible pour un cache
/// relationnel plus tard).
class OfflineStore {
  OfflineStore._();
  static final OfflineStore instance = OfflineStore._();

  Directory? _dir;

  Future<Directory> _getDir() async {
    if (_dir != null) return _dir!;
    final docs = await getApplicationDocumentsDirectory();
    _dir = Directory('${docs.path}/tablya_offline');
    await _dir!.create(recursive: true);
    return _dir!;
  }

  Future<File> _file(String name) async => File('${(await _getDir()).path}/$name');

  // ---------- File de commandes en attente ----------

  Future<List<Map<String, dynamic>>> readQueue() async {
    try {
      final f = await _file('queue.json');
      if (!await f.exists()) return [];
      final list = jsonDecode(await f.readAsString()) as List;
      return list.cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> writeQueue(List<Map<String, dynamic>> queue) async {
    final f = await _file('queue.json');
    await f.writeAsString(jsonEncode(queue));
  }

  Future<void> enqueue(Map<String, dynamic> order) async {
    final q = await readQueue();
    q.add(order);
    await writeQueue(q);
  }

  Future<void> removeFromQueue(String id) async {
    final q = await readQueue();
    q.removeWhere((o) => o['id'] == id);
    await writeQueue(q);
  }

  // ---------- Cache menu public par slug ----------

  Future<Map<String, dynamic>?> readMenuCache(String slug) async {
    try {
      final f = await _file('menu_${_safe(slug)}.json');
      if (!await f.exists()) return null;
      return jsonDecode(await f.readAsString()) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> writeMenuCache(String slug, dynamic data) async {
    final f = await _file('menu_${_safe(slug)}.json');
    await f.writeAsString(jsonEncode({
      'fetchedAt': DateTime.now().toIso8601String(),
      'data': data,
    }));
  }

  String _safe(String s) => s.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_');
}
