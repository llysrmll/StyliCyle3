<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('POST only', 405);

$d = body();
$email = strtolower(trim($d['email'] ?? ''));
$pass  = $d['password'] ?? '';

$stmt = $pdo->prepare('select * from users where email = ?');
$stmt->execute([$email]);
$u = $stmt->fetch();

if (!$u || !password_verify($pass, $u['password'])) fail('Invalid email or password.', 401);

session_regenerate_id(true);
$_SESSION['user'] = [
    'id'    => $u['id'],
    'name'  => trim($u['first_name'] . ' ' . $u['last_name']),
    'email' => $u['email'],
    'role'  => $u['role'],
];

out(['ok' => true, 'user' => $_SESSION['user']]);
