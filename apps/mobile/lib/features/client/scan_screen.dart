import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// Écran scan QR place (B6) — le QR contient un qr_token opaque
/// résolvant le tenant via le slug (docs/01 §1.6).
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final MobileScannerController _controller = MobileScannerController();
  bool _handled = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final code = capture.barcodes.firstOrNull?.rawValue;
    if (code == null || code.isEmpty) return;
    _handled = true;
    // TODO(E3): parser {slug}/{qr_token} → GET /public/etablissements/{slug}/places/{qr_token}
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('QR détecté : $code')),
    );
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
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'Pointez le QR code de votre table',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
