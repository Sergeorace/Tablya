import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';
import 'client_shell.dart';

/// Connexion client par OTP téléphone :
/// POST /clients/auth/otp → code 6 chiffres → POST /clients/auth/verify.
class OtpLoginScreen extends StatefulWidget {
  const OtpLoginScreen({super.key});

  @override
  State<OtpLoginScreen> createState() => _OtpLoginScreenState();
}

class _OtpLoginScreenState extends State<OtpLoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _error;
  String? _devCode; // code affiché en dev (SMS non configuré)

  Future<void> _requestOtp() async {
    setState(() { _busy = true; _error = null; });
    try {
      final res = await ApiClient.instance.dio.post('/clients/auth/otp',
          data: {'telephone': _phone.text.trim()});
      setState(() {
        _codeSent = true;
        _devCode = res.data['devCode'] as String?;
      });
    } on DioException {
      setState(() => _error = 'Numéro invalide ou service indisponible.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() { _busy = true; _error = null; });
    try {
      final res = await ApiClient.instance.dio.post('/clients/auth/verify', data: {
        'telephone': _phone.text.trim(),
        'code': _code.text.trim(),
      });
      await ApiClient.instance.saveTokens(
        res.data['accessToken'] as String,
        '', // JWT client 7 j — pas de refresh
        role: 'client',
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const ClientShell()),
      );
    } on DioException catch (e) {
      setState(() => _error = e.response?.statusCode == 401
          ? 'Code incorrect ou expiré.'
          : 'Service indisponible — réessayez.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Tablya',
                      style: Theme.of(context).textTheme.headlineMedium,
                      textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text('Commandez et suivez vos commandes',
                      style: Theme.of(context).textTheme.bodyMedium,
                      textAlign: TextAlign.center),
                  const SizedBox(height: 32),
                  TextField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Numéro de téléphone',
                      hintText: '+228 90 00 00 00',
                      prefixIcon: Icon(Icons.phone),
                    ),
                    enabled: !_codeSent,
                  ),
                  if (_codeSent) ...[
                    const SizedBox(height: 16),
                    TextField(
                      controller: _code,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 28, letterSpacing: 10),
                      decoration: const InputDecoration(
                        labelText: 'Code reçu par SMS',
                        counterText: '',
                      ),
                    ),
                    if (_devCode != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text('Mode dev — code : $_devCode',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.orange.shade800)),
                      ),
                  ],
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_error!,
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _busy ? null : (_codeSent ? _verify : _requestOtp),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: Text(_busy
                          ? '…'
                          : _codeSent ? 'Valider le code' : 'Recevoir le code'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
