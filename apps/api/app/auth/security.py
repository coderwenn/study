# 密码哈希与校验（passlib + bcrypt）
from passlib.context import CryptContext

# 使用 bcrypt 算法，废弃方案自动处理
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """对明文密码做 bcrypt 哈希"""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """校验明文密码是否匹配哈希"""
    return pwd_context.verify(plain, hashed)
