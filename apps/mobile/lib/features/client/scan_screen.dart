import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../core/api/qr_resolver.dart';
import '../../core/session/table_session.dart';
import 'menu_screen.dart';

/// Écran scan QR place (B6) — le QR contient slug + qr_token opaque.
/// Résolution → GET /public/.../places/{qrToken} → MenuScreen.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final MobileScannerController _controller = MobileScannerController();
  bool _handled = false;
  bool _resolving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_handled || _resolving) return;
    final barcodes = capture.barcodes;
    if (barcodes.isEmpty) return;
    final code = barcodes.first.rawValue;
    if (code == null || code.isEmpty) return;
    _handled = true;
    _resolving = true;
    final session = await QrResolver.resolve(code);
    if (!mounted) return;
    if (session == null) {
      _resolving = false;
      _handled = false;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('QR invalide ou établissement fermé')),
      );
      return;
    }
    tableSessionStore.set(session);
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const MenuScreen()),
    ).then((_) {
      _handled = false;
      _resolving = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scanner une place')),
      body: Stack(
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              margin: const EdgeInsets.all(24),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _resolving ? 'Résolution du QR…' : 'Pointez le QR code de votre table',
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
