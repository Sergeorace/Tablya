import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import '../../core/session/table_session.dart';

/// Résolution QR → GET /public/etablissements/{slug}/places/{qrToken}
/// Retourne la session table ou null si QR invalide.
class QrResolver {
  /// Formats acceptés :
  ///  - tablya://{slug}/place/{qrToken}
  ///  - https://app.tablya/{slug}/place/{qrToken}
  ///  - {slug}/{qrToken} (brut)
  static ({String slug, String qrToken})? parse(String raw) {
    final uri = Uri.tryParse(raw);
    if (uri != null && uri.pathSegments.length >= 2) {
      final seg = uri.pathSegments;
      final i = seg.indexOf('place');
      if (i >= 0 && i + 1 < seg.length) {
        return (slug: seg[i - 1], qrToken: seg[i + 1]);
      }
    }
    final parts = raw.split('/').where((p) => p.isNotEmpty).toList();
    if (parts.length == 2) return (slug: parts[0], qrToken: parts[1]);
    return null;
  }

  static Future<TableSession?> resolve(String raw) async {
    final parsed = parse(raw);
    if (parsed == null) return null;
    try {
      final res = await ApiClient.instance.dio.get(
        '/public/etablissements/${parsed.slug}/places/${parsed.qrToken}',
      );
      final place = res.data['place'] as Map<String, dynamic>?;
      return TableSession(
        slug: parsed.slug,
        qrToken: parsed.qrToken,
        placeId: place?['id'] as String?,
        placeNumero: place?['numero'] as String?,
      );
    } on DioException {
      return null;
    }
  }
}
