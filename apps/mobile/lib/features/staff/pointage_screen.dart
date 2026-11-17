import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';

/// Pointage self-service : PIN 4-6 chiffres → POST /pointage (public, idempotent).
/// Le serveur identifie l'employé par le hash HMAC du PIN.
class PointageScreen extends StatefulWidget {
  const PointageScreen({super.key});

  @override
  State<PointageScreen> createState() => _PointageScreenState();
}

class _PointageScreenState extends State<PointageScreen> {
  final _pin = TextEditingController();
  String _sens = 'arrivee'; // arrivee | depart
  bool _busy = false;
  String? _message;
  bool _ok = false;

  Future<void> _pointer() async {
    if (_pin.text.length < 4) return;
    setState(() { _busy = true; _message = null; _ok = false; });
    try {
      final res = await ApiClient.instance.dio.post('/pointage', data: {
        'methode': 'pin',
        'pin': _pin.text,
        'sens': _sens,
      });
      final d = res.data as Map<String, dynamic>;
      setState(() {
        _ok = true;
        _message = d['deja_pointe'] == true
            ? 'Déjà pointé — pointage existant retourné.'
            : 'Pointage ${_sens == 'arrivee' ? 'd\'arrivée' : 'de départ'} enregistré (${d['statut'] ?? ''}).';
      });
      _pin.clear();
    } on DioException catch (e) {
      setState(() {
        _ok = false;
        _message = e.response?.statusCode == 401
            ? 'PIN invalide.'
            : (e.response?.statusCode == 429
                ? 'Trop de tentatives — réessayez dans une minute.'
                : 'Erreur réseau — réessayez.');
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pointage')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 340),
            child: Column(
              children: [
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'arrivee', label: Text('Arrivée'), icon: Icon(Icons.login)),
                    ButtonSegment(value: 'depart', label: Text('Départ'), icon: Icon(Icons.logout)),
                  ],
                  selected: {_sens},
                  onSelectionChanged: (s) => setState(() => _sens = s.first),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _pin,
                  keyboardType: TextInputType.number,
                  obscureText: true,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 32, letterSpacing: 12),
                  decoration: const InputDecoration(
                    labelText: 'Code PIN',
                    counterText: '',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _pointer(),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _busy ? null : _pointer,
                  icon: const Icon(Icons.fingerprint),
                  label: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 24),
                    child: Text(_busy ? '…' : 'Pointer'),
                  ),
                ),
                if (_message != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 20),
                    child: Text(
                      _message!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: _ok
                            ? Colors.green.shade700
                            : Theme.of(context).colorScheme.error,
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
}
