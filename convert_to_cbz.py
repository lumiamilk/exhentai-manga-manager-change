#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
漫画转换脚本：将漫画文件夹转换为 CBZ 格式，并嵌入 ComicInfo.xml

功能：
1. 从 hitomi_data 读取漫画完整元数据
2. 生成 ComicInfo.xml（兼容 Komga）
3. 打包成 .cbz 文件
4. 支持处理文件名截断的情况
5. 跳过没有图片的漫画
6. 使用 rich 库显示进度条
7. 支持标题中包含 (数字) 的情况，提取正确的 ID

元数据说明：
- 作者/社团/类型：写入 Writer/Publisher/Genre，Komga 可直接筛选
- 标签：保留原有标签（female:/male:等）+ 语言标签
- 系列：写入 Series，同系列漫画自动归类

用法：
    python convert_to_cbz.py <漫画目录> --hitomi-data <元数据路径>
    
示例：
    python convert_to_cbz.py /mnt/d/temp/test_manga --hitomi-data /mnt/d/temp/py/hitomi_data
    python convert_to_cbz.py J:\\hitomi_comics --output D:\\cbz_output --dry-run
"""

import os
import sys
import re
import zipfile
import argparse
import shutil
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass
from xml.etree import ElementTree as ET
from xml.dom import minidom
from datetime import datetime

from rich.console import Console
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TaskProgressColumn,
    TimeElapsedColumn,
)
from rich.table import Table

console = Console()


@dataclass
class ComicMetadata:
    """漫画元数据"""
    id: str
    title: str
    title_jpn: str = ""
    artists: List[str] = None
    groups: List[str] = None
    series: List[str] = None
    characters: List[str] = None
    tags: List[str] = None
    language: str = ""
    type: str = ""
    date: datetime = None
    
    def __post_init__(self):
        if self.artists is None:
            self.artists = []
        if self.groups is None:
            self.groups = []
        if self.series is None:
            self.series = []
        if self.characters is None:
            self.characters = []
        if self.tags is None:
            self.tags = []


class HitomiDataLoader:
    """从 hitomi_data 加载完整元数据"""
    
    def __init__(self, hitomi_data_dir: str = None):
        self.hitomi_data_dir = hitomi_data_dir
        self._id_to_metadata: Dict[str, dict] = {}
        
    def load(self):
        """加载所有 hitomi_data 文件"""
        if not self.hitomi_data_dir or not os.path.exists(self.hitomi_data_dir):
            return
        
        import msgpack
        
        for filename in os.listdir(self.hitomi_data_dir):
            if not filename.endswith('_pack.json'):
                continue
            
            filepath = os.path.join(self.hitomi_data_dir, filename)
            try:
                with open(filepath, 'rb') as f:
                    data = msgpack.unpackb(f.read(), use_list=False, raw=False)
                
                for item in data:
                    comic_id = item.get('id')
                    if comic_id is None:
                        continue
                    
                    comic_id_str = str(comic_id)
                    
                    # 解析元数据
                    metadata = {
                        'id': comic_id_str,
                        'title': item.get('n', ''),
                        'language': item.get('l', ''),
                        'type': item.get('type', ''),
                        'page_count': item.get('pg', 0),
                        'date': None,
                        'artists': [],
                        'groups': [],
                        'series': [],
                        'tags': [],
                        'characters': [],
                    }
                    
                    # 日期
                    timestamp = item.get('d', 0)
                    if timestamp:
                        try:
                            metadata['date'] = datetime.fromtimestamp(timestamp)
                        except (OSError, OverflowError):
                            pass
                    
                    # 艺术家
                    artists = item.get('a')
                    if artists:
                        metadata['artists'] = list(artists) if isinstance(artists, (list, tuple)) else [artists]
                    
                    # 社团
                    groups = item.get('g')
                    if groups:
                        metadata['groups'] = list(groups) if isinstance(groups, (list, tuple)) else [groups]
                    
                    # 系列/原作
                    series = item.get('p')
                    if series:
                        metadata['series'] = list(series) if isinstance(series, (list, tuple)) else [series]
                    
                    # 标签
                    tags = item.get('t')
                    if tags:
                        metadata['tags'] = list(tags) if isinstance(tags, (list, tuple)) else [tags]
                    
                    # 角色
                    characters = item.get('c')
                    if characters:
                        metadata['characters'] = list(characters) if isinstance(characters, (list, tuple)) else [characters]
                    
                    # 存储（同时存储字符串和原始类型）
                    self._id_to_metadata[comic_id_str] = metadata
                    self._id_to_metadata[comic_id] = metadata
                    
            except Exception:
                continue
    
    def get_metadata(self, comic_id: str) -> Optional[dict]:
        """获取漫画的完整元数据"""
        return self._id_to_metadata.get(comic_id)
    
    def get_metadata_obj(self, comic_id: str) -> Optional[ComicMetadata]:
        """获取 ComicMetadata 对象"""
        data = self._id_to_metadata.get(comic_id)
        if not data:
            return None
        
        return ComicMetadata(
            id=comic_id,
            title=data.get('title', ''),
            title_jpn='',
            artists=data.get('artists', []) or [],
            groups=data.get('groups', []) or [],
            series=data.get('series', []) or [],
            characters=data.get('characters', []) or [],
            tags=data.get('tags', []) or [],
            language=data.get('language', ''),
            type=data.get('type', ''),
            date=data.get('date'),
        )


def extract_id_from_folder(folder_name: str) -> Optional[str]:
    """
    从文件夹名提取 ID
    
    格式：[Artist] Title (123456)[Language]
    
    特殊情况：标题中可能包含 (数字)，如：
    "[4riasensei] ナエナエ🐰 (58316460) 2026.01.27 (3731249)[Japanese]"
    
    规则：提取最后一个 (数字) 作为 ID，但必须后面紧跟 [Language] 或结尾
    """
    # 匹配模式：(数字) 后面紧跟 [语言] 或结尾
    # 使用 findall 找到所有匹配，取最后一个
    matches = re.findall(r'\((\d+)\)\s*(?:\[|$)', folder_name)
    if matches:
        return matches[-1]
    
    # 备用方案：如果上面没匹配到，尝试找最后一个 (数字)
    all_matches = re.findall(r'\((\d+)\)', folder_name)
    if all_matches:
        return all_matches[-1]
    
    return None


def extract_id_from_info_txt(folder_path: str) -> Optional[str]:
    """从 info.txt 中提取 ID（格式：图库 ID: 123456）"""
    info_path = os.path.join(folder_path, "info.txt")
    if not os.path.exists(info_path):
        return None
    
    try:
        with open(info_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 查找 "图库 ID: xxx" 或 "ID: xxx"
        id_match = re.search(r'(?:图库\s*)?ID:\s*(\d+)', content)
        if id_match:
            return id_match.group(1)
    except Exception:
        pass
    
    return None


def create_comicinfo_xml(metadata: ComicMetadata, page_count: int = 0) -> str:
    """生成 ComicInfo.xml 内容"""
    
    root = ET.Element("ComicInfo")
    
    # 标题
    title = metadata.title or "Unknown"
    ET.SubElement(root, "Title").text = title
    
    # 系列：仅当漫画属于明确的连载系列（非同人/原创）时才写入
    na_patterns = {'n/a', 'n／a', 'original'}
    series = [s for s in metadata.series if s and s.lower() not in na_patterns]
    comic_type = (metadata.type or '').lower()
    
    # 只有 Manga 类型且明确有系列时才写入 Series 字段
    if series and comic_type == 'manga':
        ET.SubElement(root, "Series").text = series[0]
    
    na_patterns = {'n/a', 'n／a'}
    
    # 作者/画师
    artists = [a for a in metadata.artists if a and a.lower() not in na_patterns]
    if artists:
        ET.SubElement(root, "Writer").text = ", ".join(artists)
    
    # 出版社/社团
    groups = [g for g in metadata.groups if g and g.lower() not in na_patterns]
    if groups:
        ET.SubElement(root, "Publisher").text = ", ".join(groups)
    
    # 类型/格式
    comic_type = metadata.type or "Doujinshi"
    ET.SubElement(root, "Genre").text = comic_type
    
    # 标签处理
    clean_tags = []
    for tag in metadata.tags:
        clean_tag = tag.replace("：", ":")
        if clean_tag.lower() not in na_patterns:
            clean_tags.append(clean_tag)
    
    # 添加语言标签
    lang_map = {
        "japanese": "Japanese",
        "chinese": "Chinese",
        "korean": "Korean",
        "english": "English",
        "": "Japanese",
        None: "Japanese",
    }
    lang_lower = metadata.language.lower() if metadata.language else ""
    lang_tag = lang_map.get(lang_lower, metadata.language.title() if metadata.language else "Japanese")
    clean_tags.append(lang_tag)
    
    if clean_tags:
        ET.SubElement(root, "Tags").text = ", ".join(clean_tags)
    
    # 语言（BCP47 标签）
    lang_code_map = {
        "japanese": "ja",
        "chinese": "zh",
        "korean": "ko",
        "english": "en",
        "": "ja",
        None: "ja",
    }
    lang_lower = metadata.language.lower() if metadata.language else ""
    lang_code = lang_code_map.get(lang_lower, metadata.language.lower()[:2] if metadata.language else "ja")
    ET.SubElement(root, "LanguageISO").text = lang_code
    
    # 页数
    ET.SubElement(root, "PageCount").text = str(page_count)
    
    # Manga 标记
    ET.SubElement(root, "Manga").text = "Yes"
    
    # 角色
    characters = [c for c in metadata.characters if c and c.lower() not in na_patterns]
    if characters:
        ET.SubElement(root, "Characters").text = ", ".join(characters)
    
    # 发布日期
    if metadata.date:
        ET.SubElement(root, "Year").text = str(metadata.date.year)
        ET.SubElement(root, "Month").text = str(metadata.date.month)
        ET.SubElement(root, "Day").text = str(metadata.date.day)
    
    # 年龄分级
    ET.SubElement(root, "AgeRating").text = "Adults Only 18+"
    
    # Notes
    ET.SubElement(root, "Notes").text = f"Hitomi.la Gallery ID: {metadata.id}"
    
    # Web 链接
    ET.SubElement(root, "Web").text = f"https://hitomi.la/galleries/{metadata.id}.html"
    
    # 格式化 XML
    xml_str = ET.tostring(root, encoding="unicode")
    dom = minidom.parseString(xml_str)
    return dom.toprettyxml(indent="  ", encoding=None)


def get_image_files(folder_path: str) -> List[str]:
    """获取文件夹中的所有图片文件"""
    image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
    images = []
    
    for f in os.listdir(folder_path):
        ext = os.path.splitext(f)[1].lower()
        if ext in image_extensions:
            images.append(f)
    
    return sorted(images)


def create_cbz(folder_path: str, output_path: str, metadata: ComicMetadata, 
               dry_run: bool = False) -> Tuple[bool, str]:
    """将漫画文件夹打包成 CBZ"""
    images = get_image_files(folder_path)
    
    if not images:
        return False, "没有找到图片文件"
    
    if dry_run:
        return True, f"[预览] 将打包 {len(images)} 张图片"
    
    try:
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)
        
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            comicinfo_xml = create_comicinfo_xml(metadata, len(images))
            zf.writestr("ComicInfo.xml", comicinfo_xml.encode('utf-8'))
            
            for img_name in images:
                img_path = os.path.join(folder_path, img_name)
                zf.write(img_path, img_name)
        
        return True, f"成功打包 {len(images)} 张图片"
        
    except Exception as e:
        return False, f"打包失败: {str(e)}"


def truncate_filename(folder_name: str, max_len: int = 200) -> str:
    """截断过长的文件名，保留 ID"""
    if len(folder_name) <= max_len:
        return folder_name
    
    # 尝试保留最后一个 (数字) 部分
    id_match = re.search(r'\((\d+)\)[^\(]*$', folder_name)
    if id_match:
        id_part_start = id_match.start()
        id_part = folder_name[id_part_start:]
        prefix_len = max_len - len(id_part) - 3
        if prefix_len > 0:
            return folder_name[:prefix_len] + "..." + id_part
    
    return folder_name[:max_len-3] + "..."


def convert_comics(
    source_dir: str,
    hitomi_data_dir: str,
    output_dir: str = None,
    dry_run: bool = False,
    delete_original: bool = False,
):
    """转换漫画"""
    
    # 加载 hitomi_data
    with console.status("[bold green]正在加载 hitomi_data 元数据...[/bold green]"):
        loader = HitomiDataLoader(hitomi_data_dir)
        loader.load()
    
    total_records = len(loader._id_to_metadata) // 2  # 因为同时存储了字符串和原始类型
    console.print(f"[green]✓[/green] 从 hitomi_data 加载了 {total_records} 条元数据")
    
    # 确定输出目录
    if output_dir is None:
        output_dir = source_dir
    
    if not dry_run and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # 扫描目录
    console.print(f"[bold]扫描目录:[/bold] {source_dir}")
    folders = []
    
    try:
        with os.scandir(source_dir) as entries:
            for entry in entries:
                try:
                    if entry.is_dir():
                        folders.append((entry.name, entry.path))
                except OSError:
                    pass
    except OSError as e:
        console.print(f"[red]错误: 无法读取源目录: {e}[/red]")
        return
    
    total = len(folders)
    console.print(f"[green]✓[/green] 找到 {total} 个漫画文件夹\n")
    
    if total == 0:
        console.print("[yellow]没有找到漫画文件夹[/yellow]")
        return
    
    # 统计
    stats = {
        'success': 0,
        'no_images': 0,
        'no_metadata': 0,
        'error': 0,
        'deleted': 0,
        'delete_failed': 0,
    }
    
    failed_folders: List[Dict] = []
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        
        task = progress.add_task("[cyan]转换漫画...[/cyan]", total=total)
        
        for folder_name, folder_path in folders:
            progress.update(task, description=f"[cyan]处理: {folder_name[:40]}{'...' if len(folder_name) > 40 else ''}[/cyan]")
            
            # 提取 ID
            comic_id = extract_id_from_folder(folder_name)
            metadata = None
            
            if comic_id:
                metadata = loader.get_metadata_obj(comic_id)
            
            # 如果文件夹名提取失败，尝试 info.txt
            if metadata is None:
                comic_id = extract_id_from_info_txt(folder_path)
                if comic_id:
                    metadata = loader.get_metadata_obj(comic_id)
            
            # 无法获取元数据
            if metadata is None:
                failed_folders.append({
                    'path': folder_path,
                    'name': folder_name,
                    'reason': f'无法获取元数据 (提取的ID: {comic_id or "无"})'
                })
                stats['no_metadata'] += 1
                progress.advance(task)
                continue
            
            # 检查图片
            images = get_image_files(folder_path)
            if not images:
                stats['no_images'] += 1
                progress.advance(task)
                continue
            
            # 生成输出路径
            base_name = truncate_filename(folder_name)
            cbz_name = base_name + ".cbz"
            
            tankobon_dir = os.path.join(output_dir, "单行本")
            output_path = os.path.join(tankobon_dir, cbz_name)
            
            # 执行转换
            success, message = create_cbz(folder_path, output_path, metadata, dry_run)
            
            if success:
                stats['success'] += 1
                
                # 彻底删除原文件夹
                if delete_original and not dry_run:
                    try:
                        # 先删除文件夹内所有文件，再删除文件夹
                        for root, dirs, files in os.walk(folder_path, topdown=False):
                            for file in files:
                                file_path = os.path.join(root, file)
                                try:
                                    os.remove(file_path)
                                except Exception as e:
                                    pass
                            for dir_name in dirs:
                                dir_full = os.path.join(root, dir_name)
                                try:
                                    os.rmdir(dir_full)
                                except Exception as e:
                                    pass
                        # 最后删除根目录
                        os.rmdir(folder_path)
                        
                        # 验证是否真的删除了
                        if not os.path.exists(folder_path):
                            stats['deleted'] += 1
                        else:
                            stats['delete_failed'] += 1
                            console.print(f"[yellow]⚠ 删除失败，文件夹仍存在: {folder_name}[/yellow]")
                    except Exception as e:
                        stats['delete_failed'] += 1
                        console.print(f"[yellow]⚠ 删除失败: {folder_name} - {e}[/yellow]")
            else:
                stats['error'] += 1
                failed_folders.append({
                    'path': folder_path,
                    'name': folder_name,
                    'reason': message
                })
            
            progress.advance(task)
    
    # 写入失败记录
    if failed_folders:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        failed_file = os.path.join(os.getcwd(), f"failed_comics_{timestamp}.txt")
        with open(failed_file, 'w', encoding='utf-8') as f:
            f.write(f"# 转换失败的漫画列表\n")
            f.write(f"# 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"# 总数: {len(failed_folders)}\n\n")
            for item in failed_folders:
                f.write(f"路径: {item['path']}\n")
                f.write(f"名称: {item['name']}\n")
                f.write(f"原因: {item['reason']}\n")
                f.write("-" * 80 + "\n")
        console.print(f"\n[yellow]⚠ 有 {len(failed_folders)} 个漫画无法处理，已记录到:[/yellow]")
        console.print(f"  {failed_file}")
    
    # 打印统计
    table = Table(title="\n转换统计")
    table.add_column("状态", style="cyan")
    table.add_column("数量", justify="right", style="green")
    table.add_column("比例", justify="right", style="dim")
    
    for key, label in [
        ('success', '成功'),
        ('no_images', '无图片'),
        ('no_metadata', '无元数据'),
        ('error', '错误'),
    ]:
        count = stats[key]
        ratio = f"{count/total*100:.1f}%" if total > 0 else "0%"
        table.add_row(label, str(count), ratio)
    
    table.add_row("[bold]总计[/bold]", f"[bold]{total}[/bold]", "100%")
    console.print(table)
    
    # 删除统计
    if delete_original and not dry_run:
        del_table = Table(title="\n删除统计")
        del_table.add_column("状态", style="cyan")
        del_table.add_column("数量", justify="right", style="green")
        del_table.add_row("已删除", str(stats['deleted']))
        del_table.add_row("删除失败", str(stats['delete_failed']))
        console.print(del_table)
    
    if dry_run:
        console.print("\n[yellow][预览模式] 未实际创建文件[/yellow]")


def main():
    parser = argparse.ArgumentParser(
        description="将漫画文件夹转换为 CBZ 格式，嵌入完整元数据",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python convert_to_cbz.py /mnt/d/temp/test_manga --hitomi-data /mnt/d/temp/py/hitomi_data
  python convert_to_cbz.py J:\\hitomi_comics --dry-run
  python convert_to_cbz.py J:\\hitomi_comics --output D:\\cbz_output --delete-original
        """
    )
    
    parser.add_argument("source_dir", help="漫画文件夹所在目录")
    parser.add_argument("--hitomi-data", 
                        default="D:/soft/to_run/Technical Preview Hitomi-Downloader/core/hitomi_data",
                        help="hitomi_data 目录路径（默认: D:/soft/to_run/Technical Preview Hitomi-Downloader/core/hitomi_data）")
    parser.add_argument("--output", "-o", help="输出目录（默认与源目录相同）")
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不实际转换")
    parser.add_argument("--delete-original", action="store_true", help="转换后删除原文件夹")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.source_dir):
        console.print(f"[red]错误: 源目录不存在: {args.source_dir}[/red]")
        sys.exit(1)
    
    if not os.path.exists(args.hitomi_data):
        console.print(f"[red]错误: hitomi_data 目录不存在: {args.hitomi_data}[/red]")
        sys.exit(1)
    
    convert_comics(
        source_dir=args.source_dir,
        hitomi_data_dir=args.hitomi_data,
        output_dir=args.output,
        dry_run=args.dry_run,
        delete_original=args.delete_original,
    )


if __name__ == "__main__":
    main()
